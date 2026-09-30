-- =============================================================================
-- KMS WO Inspeksi JTR diisi dari KMS realisasi — hanya untuk gardu yang belum
-- punya data saat WO terbit. Keputusan user 1 Okt 2026. Jalankan manual di
-- Supabase SQL Editor, SESUDAH `wo-inspeksi-jtr.sql`. Idempoten.
--
-- KMS item WO JTR diambil SEKALI saat WO terbit, dari panjang penghantar
-- gardu. Gardu yang belum pernah disapu tercatat 0 ('kosong') dan tidak
-- pernah berubah, padahal realisasinya bertambah setelah disapu — Capaian WO
-- tidak pernah bisa dihitung.
--
-- Sekarang: begitu inspeksi JTR gardu itu TERKIRIM SELESAI dari HP (atau
-- diverifikasi), item WO yang masih 'kosong' diisi KMS realisasinya dan
-- ditandai 'realisasi'. Dikirim ulang (setelah dikembalikan) → diperbarui.
--
--   • Item yang sejak terbit sudah ber-KMS ('hitungan' sistem / 'ketikan'
--     tempelan) TIDAK disentuh — itu targetnya.
--   • KMS realisasi 0 → WO-nya memang 0 (tetap ditandai 'realisasi').
-- =============================================================================


-- Item yang boleh diisi dari realisasi: belum punya data saat terbit, atau
-- sudah pernah diisi dari realisasi (kiriman ulang).
CREATE OR REPLACE FUNCTION public._jtr_item_tanpa_km(p_dari TEXT, p_km NUMERIC)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $fn$
  SELECT p_dari IN ('kosong', 'realisasi') OR (p_dari IS NULL AND COALESCE(p_km, 0) = 0);
$fn$;

CREATE OR REPLACE FUNCTION public.jtr_isi_km_wo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.wo_item_id IS NOT NULL AND NEW.status IN ('Selesai', 'Diverifikasi') THEN
    -- Sumber sama dengan kolom realisasi di Rekap Kinerja.
    UPDATE public.wo_inspeksi_item i
       SET panjang_km = COALESCE((SELECT round(sum(g.panjang_km), 3) FROM public.gardu_jtr_penghantar g
                                   WHERE g.gardu_kode = NEW.gardu_kode AND g.ulp = NEW.ulp), 0),
           panjang_dari = 'realisasi',
           updated_at = now()
     WHERE i.id = NEW.wo_item_id
       AND public._jtr_item_tanpa_km(i.panjang_dari, i.panjang_km);
  END IF;
  RETURN NEW;
END $fn$;

-- `wo_item_id` ikut: WO yang terbit SESUDAH inspeksinya selesai menyambung
-- lewat UPDATE kolom itu, bukan lewat status.
DROP TRIGGER IF EXISTS trg_jtr_isi_km_wo ON public.inspeksi_jtr;
CREATE TRIGGER trg_jtr_isi_km_wo AFTER INSERT OR UPDATE OF status, wo_item_id ON public.inspeksi_jtr
  FOR EACH ROW EXECUTE FUNCTION public.jtr_isi_km_wo();


-- Inspeksi yang sudah terkirim sebelum skrip ini: diisi sekali.
UPDATE public.wo_inspeksi_item i
   SET panjang_km = COALESCE((SELECT round(sum(g.panjang_km), 3) FROM public.gardu_jtr_penghantar g
                               WHERE g.gardu_kode = r.gardu_kode AND g.ulp = r.ulp), 0),
       panjang_dari = 'realisasi',
       updated_at = now()
  FROM public.inspeksi_jtr r
 WHERE r.wo_item_id = i.id
   AND r.status IN ('Selesai', 'Diverifikasi')
   AND i.jenis = 'JTR'
   AND public._jtr_item_tanpa_km(i.panjang_dari, i.panjang_km);


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT panjang_dari, count(*), sum(panjang_km) FROM wo_inspeksi_item
--    WHERE jenis = 'JTR' AND status <> 'Dibatalkan' GROUP BY 1;
