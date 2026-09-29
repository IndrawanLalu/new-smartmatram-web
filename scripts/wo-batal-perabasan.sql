-- =============================================================================
-- WO Perabasan: keluarkan segmen (satu / banyak) & batalkan WO keseluruhan
-- (permintaan user 29 Sep 2026). Jalankan SESUDAH `wo-tempel-semua.sql`.
-- Idempoten. Pola ini nantinya diterapkan ke semua jenis WO.
--
-- Aturan:
--   • Segmen yang SUDAH DIKERJAKAN tidak bisa dikeluarkan. "Dikerjakan" =
--     statusnya bukan lagi 'Dijadwalkan' (regu sudah memulai, menyelesaikan,
--     dikembalikan admin, atau sudah diverifikasi). Sebelumnya yang dijaga
--     hanya 'Diverifikasi' — segmen yang sedang dikerjakan regu bisa hilang
--     dari HP-nya di tengah jalan.
--   • WO yang salah DIBATALKAN beserta alasannya, bukan dihapus
--     (teknisaplikasi.md butir 12): tetap tersimpan, hilang dari HP regu, tidak
--     dihitung terbit, dan segmennya bebas ditempel / disusun ulang. Hanya bisa
--     kalau belum ada satu segmen pun yang dikerjakan.
--   • Segmen bersumber 'tempelan' yang keluar dari WO dan tidak dipakai di mana
--     pun lagi DINONAKTIFKAN — supaya tempelan yang salah (mis. penyulang ULP
--     lain) tidak menetap di Master Segmen dan muncul di pemilih bulan depan.
-- =============================================================================

ALTER TABLE public.wo_perabasan
  ADD COLUMN IF NOT EXISTS batal_alasan TEXT,
  ADD COLUMN IF NOT EXISTS batal_oleh   TEXT,
  ADD COLUMN IF NOT EXISTS batal_at     TIMESTAMPTZ;


-- ── 1. Inti: keluarkan satu item (tanpa penjaga hak — dipanggil pembungkus) ──
-- Mengembalikan NULL kalau berhasil, atau sebab kenapa tidak bisa.
CREATE OR REPLACE FUNCTION public._keluarkan_perabasan_item(p_item_id UUID, p_alasan TEXT, p_oleh TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it  RECORD;
BEGIN
  SELECT * INTO it FROM public.wo_perabasan_item WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'Item WO tidak ditemukan.'; END IF;
  IF it.status = 'Dibatalkan' THEN RETURN 'Sudah dikeluarkan sebelumnya.'; END IF;
  IF it.status <> 'Dijadwalkan' THEN
    RETURN format('Sudah dikerjakan (status %s) — tidak bisa dikeluarkan dari WO.', it.status);
  END IF;

  UPDATE public.wo_perabasan_item
  SET status = 'Dibatalkan', catatan = p_alasan, updated_at = now()
  WHERE id = p_item_id;

  -- Segmen tempelan yang tidak dipakai lagi di mana pun → nonaktif.
  UPDATE public.segmen s SET status = 'nonaktif', updated_at = now()
  WHERE s.id = it.segmen_id AND s.sumber = 'tempelan' AND s.status = 'aktif'
    AND NOT EXISTS (SELECT 1 FROM public.wo_perabasan_item x WHERE x.segmen_id = s.id AND x.status <> 'Dibatalkan')
    AND NOT EXISTS (SELECT 1 FROM public.wo_inspeksi_item x WHERE x.segmen_id = s.id AND x.status <> 'Dibatalkan')
    AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm x WHERE x.segmen_id = s.id);

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_perabasan_item', it.segmen_nama, it.ulp, 'dibatalkan',
          to_jsonb(it.status), to_jsonb(p_alasan), 'sunting_admin', auth.uid(), p_oleh);
  RETURN NULL;
END $fn$;
REVOKE EXECUTE ON FUNCTION public._keluarkan_perabasan_item(UUID, TEXT, TEXT) FROM PUBLIC, authenticated;


-- ── 2. Satu segmen (modal detail) — nama & tanda tangan lama tetap ───────────
CREATE OR REPLACE FUNCTION public.batalkan_perabasan_item(
  p_item_id UUID,
  p_alasan  TEXT,
  p_oleh    TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  unit  TEXT;
  sebab TEXT;
BEGIN
  SELECT ulp INTO unit FROM public.wo_perabasan_item WHERE id = p_item_id;
  IF unit IS NULL THEN RAISE EXCEPTION 'Item WO tidak ditemukan'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi. Tanpa itu, enam bulan lagi tidak ada yang bisa menjawab kenapa segmen ini keluar dari WO.';
  END IF;
  sebab := public._keluarkan_perabasan_item(p_item_id, btrim(p_alasan), p_oleh);
  IF sebab IS NOT NULL THEN RAISE EXCEPTION '%', sebab; END IF;
END $fn$;
GRANT EXECUTE ON FUNCTION public.batalkan_perabasan_item(UUID, TEXT, TEXT) TO authenticated;


-- ── 3. Banyak segmen sekaligus (centang di Daftar Segmen) ────────────────────
-- Yang tidak bisa dikeluarkan DILEWATI dengan sebabnya — satu segmen yang
-- sudah dikerjakan tidak boleh menggagalkan sembilan yang lain.
CREATE OR REPLACE FUNCTION public.keluarkan_perabasan_banyak(
  p_item_id UUID[],
  p_alasan  TEXT,
  p_oleh    TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it       RECORD;
  sebab    TEXT;
  n        INT := 0;
  dilewati JSONB := '[]'::jsonb;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi.'; END IF;
  FOR it IN SELECT id, ulp, segmen_nama FROM public.wo_perabasan_item WHERE id = ANY(p_item_id) LOOP
    PERFORM public.wajib_boleh_ulp(it.ulp);
    sebab := public._keluarkan_perabasan_item(it.id, btrim(p_alasan), p_oleh);
    IF sebab IS NULL THEN n := n + 1;
    ELSE dilewati := dilewati || jsonb_build_object('objek', it.segmen_nama, 'sebab', sebab);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('keluar', n, 'dilewati', dilewati);
END $fn$;
GRANT EXECUTE ON FUNCTION public.keluarkan_perabasan_banyak(UUID[], TEXT, TEXT) TO authenticated;


-- ── 4. Batalkan WO keseluruhan ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.batalkan_wo_perabasan(
  p_wo_id  UUID,
  p_alasan TEXT,
  p_oleh   TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  w       RECORD;
  it      RECORD;
  jalan   INT;
  n       INT := 0;
BEGIN
  SELECT * INTO w FROM public.wo_perabasan WHERE id = p_wo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WO tidak ditemukan'; END IF;
  PERFORM public.wajib_boleh_ulp(w.ulp);
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan WO wajib diisi.'; END IF;
  IF w.status <> 'Terbit' THEN RAISE EXCEPTION 'WO "%" sudah berstatus %.', w.nama, w.status; END IF;

  SELECT count(*) INTO jalan FROM public.wo_perabasan_item
  WHERE wo_id = p_wo_id AND status NOT IN ('Dijadwalkan', 'Dibatalkan');
  IF jalan > 0 THEN
    RAISE EXCEPTION 'WO "%" tidak bisa dibatalkan: % segmen sudah dikerjakan regu. Keluarkan saja segmen yang belum dikerjakan.', w.nama, jalan;
  END IF;

  FOR it IN SELECT id FROM public.wo_perabasan_item WHERE wo_id = p_wo_id AND status = 'Dijadwalkan' LOOP
    PERFORM public._keluarkan_perabasan_item(it.id, 'WO dibatalkan: ' || btrim(p_alasan), p_oleh);
    n := n + 1;
  END LOOP;

  UPDATE public.wo_perabasan
  SET status = 'Dibatalkan', batal_alasan = btrim(p_alasan), batal_oleh = p_oleh, batal_at = now(), updated_at = now()
  WHERE id = p_wo_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_perabasan', w.nama, w.ulp, 'dibatalkan', to_jsonb(w.status),
          jsonb_build_object('alasan', btrim(p_alasan), 'segmen', n), 'sunting_admin', auth.uid(), p_oleh);
  RETURN n;
END $fn$;
GRANT EXECUTE ON FUNCTION public.batalkan_wo_perabasan(UUID, TEXT, TEXT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT nama, status, batal_alasan FROM wo_perabasan ORDER BY created_at DESC;
--   SELECT nama, penyulang, status FROM segmen WHERE sumber = 'tempelan';
