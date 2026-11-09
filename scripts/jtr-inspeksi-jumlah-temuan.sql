-- =============================================================================
-- Daftar Inspeksi JTR: jumlah temuan dihitung per inspeksi yang tampil (9 Nov 2026).
--
-- Sebelumnya jtr_inspeksi.jumlah_temuan = GROUP BY seluruh inspeksi_jtr_temuan.
-- View itu memakai CTE `dasar` berkali-kali → dimaterialkan → saringan
-- status/ULP tidak bisa masuk, jadi tiap buka daftar "berjalan" menghitung
-- temuan SEMUA inspeksi (2,2–2,6 dtk).
--
-- Kini jumlahnya dihitung oleh _jtr_jumlah_temuan(id) hanya untuk baris yang
-- diminta. Aturannya SALINAN cabang-cabang inspeksi_jtr_temuan (tanpa kode
-- tiang, yang tak memengaruhi jumlah). ⚠ Mengubah aturan temuan di view itu =
-- ubah juga fungsi ini. Daftar temuan saat baris diklik tetap dari view.
-- Idempoten.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._jtr_jumlah_temuan(p_inspeksi UUID)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  WITH dasar AS (
    -- Seperti CTE `dasar` view, TANPA LEFT JOIN jtr_tiang: di view itu cuma
    -- untuk kode tiang, dan per baris membuat daftar lengkap timeout (9 Nov).
    -- Satu-satunya beda: tiang yang tercatat dua kali di gardu yang sama
    -- (data kembar) dihitung sekali di sini, dua kali di view.
    SELECT t.id, t.gardu_kode, t.kondisi, t.arde_kondisi, t.andongan,
           t.stay_kondisi, t.rawan_row, t.jamperan, t.catatan_perbaikan,
           i.gardu_kode AS i_gardu
    FROM public.inspeksi_jtr i
    JOIN public.inspeksi_jtr_titik x ON x.inspeksi_id = i.id
    JOIN public.tiang t ON t.id = x.tiang_id
    WHERE i.id = p_inspeksi AND i.status <> 'Dibatalkan'
  )
  SELECT
    COALESCE((SELECT sum(
        (d.kondisi      IS NOT NULL AND NOT public.jtr_normal('kondisi_tiang',    d.kondisi))::int
      + (d.arde_kondisi IS NOT NULL AND NOT public.jtr_normal('kondisi_arde',     d.arde_kondisi))::int
      + (d.andongan     IS NOT NULL AND NOT public.jtr_normal('kondisi_andongan', d.andongan))::int
      + (d.stay_kondisi IS NOT NULL AND NOT public.jtr_normal('kondisi_stay',     d.stay_kondisi))::int
      + (btrim(COALESCE(d.catatan_perbaikan, '')) <> '')::int
      + (SELECT count(*) FROM unnest(d.rawan_row) r(v)
          WHERE r.v IS NOT NULL AND r.v <> '' AND NOT public.jtr_normal('rawan_row', r.v))
      + (SELECT count(*) FROM jsonb_array_elements(d.jamperan) j(v)
          WHERE (j.v->>'kondisi') IS NOT NULL AND NOT public.jtr_normal('kondisi_jamperan', j.v->>'kondisi'))
    ) FROM dasar d), 0)
    +
    -- Kabel milik gardu inspeksi ini (= jtr_kabel.gardu = upper(gardu inspeksi)).
    COALESCE((SELECT sum(
        (k.kondisi         IS NOT NULL AND NOT public.jtr_normal('kondisi_kabel',     k.kondisi))::int
      + (k.aks_suspension  IS NOT NULL AND NOT public.jtr_normal('kondisi_aksesoris', k.aks_suspension))::int
      + (k.aks_large_angle IS NOT NULL AND NOT public.jtr_normal('kondisi_aksesoris', k.aks_large_angle))::int
      + (k.aks_dead_end    IS NOT NULL AND NOT public.jtr_normal('kondisi_aksesoris', k.aks_dead_end))::int
    ) FROM dasar d
      JOIN public.tiang_konduktor k ON k.tiang_id = d.id
       AND upper(COALESCE(k.pemilik_gardu_kode, d.gardu_kode)) = upper(d.i_gardu)), 0);
$$;

GRANT EXECUTE ON FUNCTION public._jtr_jumlah_temuan(UUID) TO authenticated;


-- Sama dengan jtr-rekap-ringkas.sql; hanya jumlah_temuan yang berganti sumber.
CREATE OR REPLACE VIEW public.jtr_inspeksi AS
SELECT i.id,
  i.gardu_kode,
  i.ulp,
  i.penyulang,
  i.tgl_mulai,
  i.tgl_selesai,
  i.status,
  i.inspektor_nama,
  i.petugas_2,
  i.catatan,
  i.verified_at,
  i.verified_by,
  i.verified_note,
  g.nama   AS gardu_nama,
  g.alamat AS gardu_alamat,
  k.tiang_aktif,
  k.sudah_diperiksa,
  k.tiang_baru,
  public._jtr_jumlah_temuan(i.id) AS jumlah_temuan,
  COALESCE(( SELECT round(sum(gg.panjang_rute_km), 3)
               FROM public.gardu_jtr_panjang gg
              WHERE upper(gg.gardu_kode) = upper(i.gardu_kode) AND upper(gg.ulp) = upper(i.ulp)), 0::numeric) AS panjang_km,
  w.nama   AS wo_nama,
  w.tgl_wo
FROM public.inspeksi_jtr i
LEFT JOIN public.gardu g ON upper(g.kode) = upper(i.gardu_kode) AND upper(g.ulp) = upper(i.ulp)
LEFT JOIN public.inspeksi_jtr_kelengkapan k ON k.inspeksi_id = i.id
LEFT JOIN public.wo_inspeksi_item wi ON wi.id = i.wo_item_id AND wi.jenis = 'JTR'
LEFT JOIN public.wo_inspeksi w ON w.id = wi.wo_id;


-- ── Pemeriksaan (harus 0 baris) ─────────────────────────────────────────────
--   SELECT i.id, public._jtr_jumlah_temuan(i.id) AS baru, COALESCE(t.n, 0) AS lama
--   FROM inspeksi_jtr i
--   LEFT JOIN (SELECT inspeksi_id, count(*) n FROM inspeksi_jtr_temuan GROUP BY 1) t ON t.inspeksi_id = i.id
--   WHERE public._jtr_jumlah_temuan(i.id) <> COALESCE(t.n, 0);
