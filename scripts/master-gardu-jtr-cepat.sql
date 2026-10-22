-- =============================================================================
-- master_gardu_jtr dipercepat (22 Okt 2026).
--
-- Gejala: Inspeksi JTR di HP → pilih WO → "Data gardu belum termuat".
-- Akarnya: view ini menghitung panjang penghantar, jumlah tiang, dan inspeksi
-- terakhir lewat LATERAL PER GARDU (±2.500 gardu × view rekursif
-- gardu_jtr_penghantar + jtr_tiang dengan upper() yang tak bisa memakai indeks)
-- → 8,5 dtk → "canceling statement due to statement timeout" (57014).
-- Sama dengan peta_gardu (peta-gardu-cepat.sql).
--
-- Perbaikan: tiap angka dihitung SEKALI untuk semua gardu (GROUP BY), lalu
-- digabung. Kolom, nama, tipe, dan arti angka TIDAK berubah — HP & web
-- (Susun WO) tidak perlu diubah. Idempoten (aman diulang).
-- =============================================================================

CREATE OR REPLACE VIEW public.master_gardu_jtr AS
SELECT
  upper(g.kode) AS gardu_kode,
  upper(g.ulp)  AS ulp,
  g.nama,
  g.feeder      AS penyulang,
  COALESCE(pj.km, 0)::numeric(10,3) AS panjang_km,
  COALESCE(tg.jumlah, 0)            AS jumlah_tiang,
  ins.terakhir                      AS terakhir_inspeksi,
  CASE WHEN ins.terakhir IS NULL THEN NULL
       ELSE floor((CURRENT_DATE - ins.terakhir) / 30.0)::int END AS umur_inspeksi_bulan
FROM public.gardu g
LEFT JOIN (
  SELECT upper(p.gardu_kode) AS kode, upper(p.ulp) AS ulp, sum(p.panjang_km) AS km
  FROM public.gardu_jtr_penghantar p
  GROUP BY 1, 2
) pj ON pj.kode = upper(g.kode) AND pj.ulp = upper(g.ulp)
LEFT JOIN (
  -- Termasuk batang pinjaman (`jtr_tiang`) — jumlah tiang jaringan gardu ini.
  SELECT upper(t.gardu_kode) AS kode, upper(t.ulp) AS ulp, count(*) AS jumlah
  FROM public.jtr_tiang t
  WHERE t.status_hidup = 'aktif'
  GROUP BY 1, 2
) tg ON tg.kode = upper(g.kode) AND tg.ulp = upper(g.ulp)
LEFT JOIN (
  -- Umur dihitung dari yang DISETUJUI saja — pola master_segmen.
  SELECT upper(i.gardu_kode) AS kode, upper(i.ulp) AS ulp, max(i.tgl_selesai) AS terakhir
  FROM public.inspeksi_jtr i
  WHERE i.status = 'Diverifikasi'
  GROUP BY 1, 2
) ins ON ins.kode = upper(g.kode) AND ins.ulp = upper(g.ulp);
GRANT SELECT ON public.master_gardu_jtr TO authenticated;
