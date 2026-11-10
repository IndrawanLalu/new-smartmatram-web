-- =============================================================================
-- Temuan JTM lebih cepat (11 Nov 2026). Jalankan SESUDAH jtm-temuan-tugas-regu.sql,
-- jtm-kategori-temuan.sql, dan kondisi-tiang-ringkas.sql. Idempoten.
--
-- Masalah: tab Temuan kadang habis waktu. Web menarik jtm_temuan per 1.000
-- baris (3 halaman untuk 3.053 temuan) dan jtm_kategori_temuan juga 3 halaman;
-- SETIAP halaman menghitung ulang view dari ±419 ribu baris kondisi tiang
-- (1,5–4,5 detik per halaman dengan kunci layanan, lebih lambat lewat RLS).
--
-- Perbaikan:
--   1. jtm_temuan dimulai dari pilihan tidak normal → indeks (item_kode, nilai).
--      Kolom lama SAMA (web, WA, peta tidak berubah) + kategori_temuan di akhir.
--   2. RPC jtm_temuan_daftar(p_ulp): seluruh temuan dalam SATU jawaban JSON —
--      view dihitung sekali, bukan sekali per halaman.
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_kondisi_tiang_item_nilai ON public.kondisi_tiang_terakhir (item_kode, nilai);
CREATE INDEX IF NOT EXISTS inspeksi_jtm_titik_inspeksi_tiang_idx ON public.inspeksi_jtm_titik (inspeksi_id, tiang_id);

CREATE OR REPLACE VIEW public.jtm_temuan AS
SELECT
  k.tiang_id,
  k.tiang_kode,
  k.pemilik               AS penyulang,
  k.ulp,
  k.item_kode,
  k.item_nama,
  k.kelompok,
  CASE WHEN k.kelompok = 'ROW' THEN 'ROW' ELSE 'Jaringan' END AS jenis,
  k.bagian,
  k.sirkit_segmen_id,
  k.sirkit_nama,
  k.nilai,
  k.nilai_label,
  k.catatan,
  k.foto_url,
  k.tgl                   AS ditemukan_pada,
  k.inspeksi_id           AS inspeksi_jtm_id,
  m.petugas_nama          AS penemu,
  seg.segmen_id,
  seg.segmen_nama,
  t.lat,
  t.lng,
  tg.id                   AS tugas_id,
  tg.status               AS tugas_status,
  tg.eksekutor,
  tg.category             AS prioritas,
  tg.assigned_at,
  tg.team_name,
  tg.foto_sesudah_url,
  tg.updated_at           AS tugas_diperbarui,
  CASE
    -- ★ 'Temuan' = penugasannya dicabut di Monitoring Inspeksi (eksekutor dikosongkan).
    WHEN tg.id IS NULL OR tg.status IN ('Batal', 'Temuan') THEN 'Belum ditugaskan'
    WHEN tg.status = 'Selesai' AND k.tgl > tg.updated_at THEN 'Belum ditugaskan'
    WHEN tg.status = 'Selesai'                           THEN 'Selesai'
    ELSE 'Ditugaskan'
  END                     AS status_tugas,
  wo.nama                 AS wo_perabasan_aktif,
  -- ★ 11 Nov: kategori pilihan regu (Urgent/Rawan/Biasa) ikut di sini — dulu
  --   web menarik SELURUH jtm_kategori_temuan terpisah, tiga halaman lagi.
  kt.kategori_temuan
-- ★ 11 Nov: mulai dari pilihan yang TIDAK NORMAL (puluhan baris) lalu indeks
--   (item_kode, nilai), bukan membaca ±419 ribu kondisi tiang lalu menyaring.
--   Kolom k = kolom tiang_kondisi_terakhir yang dipakai di bawah.
FROM (
  SELECT j.tiang_id, t0.kode AS tiang_kode, t0.penyulang AS pemilik, j.ulp, j.item_kode, i.nama AS item_nama,
         i.kelompok, j.bagian, j.sirkit_segmen_id, s.nama AS sirkit_nama, j.nilai, o.label AS nilai_label,
         j.catatan, j.foto_url, j.tgl, j.inspeksi_id
  FROM public.jtm_opsi_ref o
  JOIN public.kondisi_tiang_terakhir j ON j.item_kode = o.item_kode AND j.nilai = o.kode
  JOIN public.tiang t0        ON t0.id = j.tiang_id
  JOIN public.jtm_item_ref i  ON i.kode = j.item_kode
  LEFT JOIN public.segmen s   ON s.id = j.sirkit_segmen_id
  WHERE NOT o.normal
) k
JOIN public.tiang t ON t.id = k.tiang_id
LEFT JOIN public.inspeksi_jtm m ON m.id = k.inspeksi_id
-- Tiang bisa milik beberapa segmen (percabangan, tiang bersama); yang
-- didahulukan segmen tempat temuan itu dicatat.
LEFT JOIN LATERAL (
  SELECT s.id AS segmen_id, s.nama AS segmen_nama
  FROM public.segmen_tiang st
  JOIN public.segmen s ON s.id = st.segmen_id
  WHERE st.tiang_id = k.tiang_id AND s.status = 'aktif'
  ORDER BY (s.id = m.segmen_id) DESC NULLS LAST, s.nama
  LIMIT 1
) seg ON true
-- ★ Tugas bisa di `inspeksi` (jaringan) ATAU `inspeksi_pohon` (ROW, sejak
--   8 Okt 2026) — yang terbaru dari keduanya.
LEFT JOIN LATERAL (
  SELECT x.id, x.status, x.eksekutor, x.category, x.assigned_at, x.team_name, x.foto_sesudah_url, x.updated_at
  FROM (
    SELECT i.id, i.status, i.eksekutor, i.category, i.assigned_at, i.team_name, i.foto_sesudah_url, i.updated_at, i.created_at
    FROM public.inspeksi i
    WHERE i.sumber_tiang_id = k.tiang_id
      AND i.sumber_item = k.item_kode
      AND i.sumber_bagian IS NOT DISTINCT FROM k.bagian
      AND i.sumber_sirkit_id IS NOT DISTINCT FROM k.sirkit_segmen_id
    UNION ALL
    SELECT p.id, p.status, p.eksekutor, p.category, p.assigned_at, p.team_name, p.foto_sesudah_url, p.updated_at, p.created_at
    FROM public.inspeksi_pohon p
    WHERE p.sumber_tiang_id = k.tiang_id
      AND p.sumber_item = k.item_kode
      AND p.sumber_bagian IS NOT DISTINCT FROM k.bagian
      AND p.sumber_sirkit_id IS NOT DISTINCT FROM k.sirkit_segmen_id
  ) x
  ORDER BY x.created_at DESC
  LIMIT 1
) tg ON true
-- Vegetasi juga dihitung WO Perabasan per segmen. Penugasan tetap bebas
-- (keputusan user), tapi layar perlu tahu supaya pohon tidak dirabas dua regu.
LEFT JOIN LATERAL (
  SELECT w.nama
  FROM public.wo_perabasan_item wi
  JOIN public.wo_perabasan w ON w.id = wi.wo_id
  WHERE k.kelompok = 'ROW'
    AND wi.segmen_id = seg.segmen_id
    AND w.status = 'Terbit'
    AND wi.status NOT IN ('Diverifikasi', 'Dibatalkan')
  LIMIT 1
) wo ON true
LEFT JOIN LATERAL (
  SELECT p.kategori_temuan
  FROM public.inspeksi_jtm_titik tk
  JOIN public.inspeksi_jtm_periksa p ON p.titik_id = tk.id
  WHERE tk.inspeksi_id = k.inspeksi_id AND tk.tiang_id = k.tiang_id
    AND p.item_kode = k.item_kode AND p.bagian = k.bagian
    AND p.sirkit_segmen_id IS NOT DISTINCT FROM k.sirkit_segmen_id
    AND p.kategori_temuan IS NOT NULL
  LIMIT 1
) kt ON true;

GRANT SELECT ON public.jtm_temuan TO authenticated;

CREATE OR REPLACE FUNCTION public.jtm_temuan_daftar(p_ulp TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  FROM public.jtm_temuan t
  WHERE p_ulp IS NULL OR t.ulp = upper(p_ulp);
$fn$;
REVOKE ALL ON FUNCTION public.jtm_temuan_daftar(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jtm_temuan_daftar(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT count(*) FROM jtm_temuan;                        -- sama dengan sebelumnya
--   EXPLAIN ANALYZE SELECT public.jtm_temuan_daftar('AMPENAN');
