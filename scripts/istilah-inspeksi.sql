-- =============================================================================
-- Istilah "penyapuan" diganti "inspeksi" — di sisi database
-- Jalankan SESUDAH `batalkan-inspeksi.sql`. Idempoten.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
-- User: "kata penyapuan, nyapu, sapu itu terasa aneh di bahasa saya."
-- Diputuskan 21 Sep 2026: satuan kerjanya disebut **Inspeksi JTR · Gardu X**
-- dan **Inspeksi JTM · Segmen X**. Bukan "inspeksi gardu" — nama itu sudah
-- dipakai modul Pemeliharaan Gardu, dan yang diperiksa di sini adalah JARINGAN
-- di bawah gardu, bukan gardunya.
--
-- Kabar baiknya: tabel intinya sudah bernama benar sejak awal (`inspeksi_jtm`,
-- `inspeksi_jtr`). Yang tersisa cuma satu view, enam fungsi, dan tiga kolom.
--
-- ── KENAPA PAKAI PEMBUNGKUS, BUKAN GANTI LANGSUNG ───────────────────────────
-- Panggilan Supabase berupa STRING: `supabase.rpc("mulai_penyapuan_jtm", …)`.
-- Acuan yang terlewat TIDAK ketahuan saat `tsc` maupun `pnpm build` — dia gagal
-- saat tombolnya ditekan, di lapangan.
--
-- Lebih gawat lagi di HP: OTA baru aktif sesudah force-close dua kali, jadi
-- selalu ada petugas yang menjalankan versi lama berhari-hari sesudah
-- publikasi. Kalau nama fungsinya berganti serentak, mereka gagal menyimpan
-- pekerjaan sehari penuh — dan gagalnya baru ketahuan saat menekan simpan di
-- ujung hari.
--
-- Karena itu: nama baru memikul isinya, nama lama jadi pembungkus tipis yang
-- meneruskan. Keduanya hidup berdampingan. Pembungkusnya dibuang di berkas
-- terpisah, SESUDAH dipastikan tidak ada lagi yang memanggilnya.
--
-- ── YANG SENGAJA TIDAK DIGANTI ──────────────────────────────────────────────
--   `jtm_tiang_tersapu`   penolong yang cuma dipanggil dari dalam SQL. Tidak
--                         pernah dilihat siapa pun, dan menggantinya menuntut
--                         menyunting pemanggilnya di berkas lain — risiko tanpa
--                         satu pun perbedaan yang terlihat.
--   kunci JSONB           `penyapuan_selesai`, `penyapuan_dibuang`. Itu muatan
--                         antara database dan aplikasi, sekelas nama variabel.
--                         Aturan yang sudah kita pegang: `field` tetap, `nama`
--                         boleh diganti — ini `field`.
--   nama berkas & variabel di aplikasi.
--
-- ── ⚠ CATATAN UNTUK BERKAS PEMBERSIH NANTI ─────────────────────────────────
-- Dua fungsi LAIN memanggil nama lama dari dalam SQL, dan keduanya TIDAK ikut
-- diganti di sini — mereka bekerja lewat pembungkus:
--
--     rintis_segmen_jtm  → public.mulai_penyapuan_jtm      (2 tempat)
--     tutup_segmen_jtm   → public.selesaikan_penyapuan_jtm (1 tempat)
--
-- Membuang pembungkus tanpa menyunting keduanya lebih dulu akan mematikan
-- perintah "rintis segmen" dan "tutup segmen" di HP — dan matinya baru
-- ketahuan saat regu menekannya di lapangan, bukan saat skripnya dijalankan.
-- =============================================================================

-- ── 1. View: jtr_penyapuan → jtr_inspeksi ────────────────────────────────────
-- Isinya PINDAH, tidak disalin. Menyalin definisi view ke berkas kedua berarti
-- dua kebenaran yang cepat atau lambat berselisih — persis yang diperingatkan
-- `jtr-inspeksi-schema.sql` tentang dirinya sendiri.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'jtr_penyapuan')
     AND NOT EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'jtr_inspeksi')
  THEN
    ALTER VIEW public.jtr_penyapuan RENAME TO jtr_inspeksi;
  END IF;
END $$;

-- Nama lama tetap bisa dibaca aplikasi yang belum diperbarui.
CREATE OR REPLACE VIEW public.jtr_penyapuan AS SELECT * FROM public.jtr_inspeksi;

COMMENT ON VIEW public.jtr_inspeksi IS
  'Daftar inspeksi JTR — satu baris per gardu yang jaringannya ditelusuri. Menggantikan jtr_penyapuan.';
COMMENT ON VIEW public.jtr_penyapuan IS
  'PEMBUNGKUS SEMENTARA untuk jtr_inspeksi. Dibuang setelah semua aplikasi memakai nama baru.';


-- ── 2. Fungsi: isinya dipindah, nama lama jadi pembungkus ───────────────────
-- `ALTER FUNCTION ... RENAME` memindahkan badan fungsinya tanpa menyalin. Kalau
-- badannya disalin ke sini, dua salinan akan hidup di dua berkas dan
-- menjalankan ulang berkas yang lebih lama akan diam-diam mengembalikan versi
-- usang — tanpa galat apa pun.
--
-- Dibungkus DO + pemeriksaan pg_proc supaya aman dijalankan berulang: pada
-- jalan kedua fungsinya sudah bernama baru, dan ALTER tanpa penjaga akan gagal.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('mulai_penyapuan_jtm',        'mulai_inspeksi_jtm'),
      ('selesaikan_penyapuan_jtm',   'selesaikan_inspeksi_jtm'),
      ('putuskan_penyapuan_jtm',     'putuskan_inspeksi_jtm'),
      ('gabung_penyapuan_jtm',       'gabung_inspeksi_jtm'),
      ('buang_penyapuan_kosong_jtm', 'buang_inspeksi_kosong_jtm'),
      -- Sekalian diberi akhiran _jtr: sampai sekarang dia satu-satunya yang
      -- tidak menyebut modulnya, padahal ada kembarannya di JTM.
      ('selesaikan_penyapuan',       'selesaikan_inspeksi_jtr')
    ) AS t(lama, baru)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = r.lama)
       AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                       WHERE n.nspname = 'public' AND p.proname = r.baru)
    THEN
      EXECUTE format('ALTER FUNCTION public.%I RENAME TO %I', r.lama, r.baru);
    END IF;
  END LOOP;
END $$;


-- ── 3. Pembungkus nama lama ──────────────────────────────────────────────────
-- Tipis, tanpa logika sendiri. Satu-satunya tugasnya meneruskan — kalau ada
-- aturan yang ditulis di sini, dia akan berbeda dari yang di fungsi aslinya.
--
-- SECURITY DEFINER-nya ikut, karena fungsi aslinya memang butuh itu untuk
-- menulis ke tabel master.

CREATE OR REPLACE FUNCTION public.mulai_penyapuan_jtm(
  p_segmen_id UUID, p_tier TEXT DEFAULT '1', p_nama TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mulai_inspeksi_jtm(p_segmen_id, p_tier, p_nama);
$$;

CREATE OR REPLACE FUNCTION public.selesaikan_penyapuan_jtm(
  p_id UUID, p_nama TEXT DEFAULT NULL, p_catatan TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.selesaikan_inspeksi_jtm(p_id, p_nama, p_catatan);
$$;

CREATE OR REPLACE FUNCTION public.putuskan_penyapuan_jtm(
  p_id UUID, p_setuju BOOLEAN, p_nama TEXT DEFAULT NULL, p_catatan TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.putuskan_inspeksi_jtm(p_id, p_setuju, p_nama, p_catatan);
$$;

CREATE OR REPLACE FUNCTION public.gabung_penyapuan_jtm(
  p_tujuan UUID, p_oleh TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.gabung_inspeksi_jtm(p_tujuan, p_oleh);
$$;

CREATE OR REPLACE FUNCTION public.buang_penyapuan_kosong_jtm(
  p_id UUID, p_oleh TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.buang_inspeksi_kosong_jtm(p_id, p_oleh);
$$;

CREATE OR REPLACE FUNCTION public.selesaikan_penyapuan(
  p_gardu TEXT, p_ulp TEXT, p_penyulang TEXT DEFAULT NULL,
  p_nama TEXT DEFAULT NULL, p_petugas_2 TEXT DEFAULT NULL, p_catatan TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.selesaikan_inspeksi_jtr(p_gardu, p_ulp, p_penyulang, p_nama, p_petugas_2, p_catatan);
$$;

COMMENT ON FUNCTION public.mulai_penyapuan_jtm        IS 'PEMBUNGKUS SEMENTARA → mulai_inspeksi_jtm.';
COMMENT ON FUNCTION public.selesaikan_penyapuan_jtm   IS 'PEMBUNGKUS SEMENTARA → selesaikan_inspeksi_jtm.';
COMMENT ON FUNCTION public.putuskan_penyapuan_jtm     IS 'PEMBUNGKUS SEMENTARA → putuskan_inspeksi_jtm.';
COMMENT ON FUNCTION public.gabung_penyapuan_jtm       IS 'PEMBUNGKUS SEMENTARA → gabung_inspeksi_jtm.';
COMMENT ON FUNCTION public.buang_penyapuan_kosong_jtm IS 'PEMBUNGKUS SEMENTARA → buang_inspeksi_kosong_jtm.';
COMMENT ON FUNCTION public.selesaikan_penyapuan       IS 'PEMBUNGKUS SEMENTARA → selesaikan_inspeksi_jtr.';


-- ── 4. Kolom view: nama baru DITAMBAHKAN, yang lama belum dibuang ───────────
-- Sebuah view boleh menyebut ekspresi yang sama dua kali dengan nama berbeda.
-- Itu yang dipakai di sini: aplikasi lama membaca kolom lama, aplikasi baru
-- membaca yang baru, keduanya angka yang sama persis. Kolom lama dibuang di
-- berkas pembersih nanti.

CREATE OR REPLACE VIEW public.jtr_cakupan AS
SELECT
  g.ulp,
  count(*)                                                        AS gardu_master,
  count(*) FILTER (WHERE s.terakhir IS NOT NULL)                  AS pernah_disapu,
  count(*) FILTER (WHERE s.terakhir > CURRENT_DATE - 365)         AS disapu_12_bulan,
  round(100.0 * count(*) FILTER (WHERE s.terakhir > CURRENT_DATE - 365)
        / NULLIF(count(*), 0), 1)                                 AS persen_12_bulan,
  -- Nama baru. Angkanya sama persis dengan dua kolom di atas.
  count(*) FILTER (WHERE s.terakhir IS NOT NULL)                  AS pernah_diinspeksi,
  count(*) FILTER (WHERE s.terakhir > CURRENT_DATE - 365)         AS diinspeksi_12_bulan
FROM public.gardu g
LEFT JOIN LATERAL (
  SELECT max(i.tgl_selesai) AS terakhir
  FROM public.inspeksi_jtr i
  WHERE upper(i.gardu_kode) = upper(g.kode)
    AND upper(i.ulp) = upper(g.ulp)
    AND i.status IN ('Selesai', 'Diverifikasi')
) s ON true
GROUP BY g.ulp;

COMMENT ON VIEW public.jtr_cakupan IS
  'Ukuran keberhasilan program untuk JTR: berapa persen gardu yang jaringannya benar-benar dilihat orang dalam 12 bulan terakhir. Kolom pernah_disapu/disapu_12_bulan adalah nama lama — pakai pernah_diinspeksi/diinspeksi_12_bulan.';

CREATE OR REPLACE VIEW public.jtm_cakupan AS
WITH per_segmen AS (
  SELECT
    s.id AS segmen_id, s.nama, s.penyulang, s.ulp,
    count(st.tiang_id)                                        AS tiang,
    count(*) FILTER (WHERE k.tiang_id IS NOT NULL)            AS tiang_dinilai
  FROM public.segmen s
  LEFT JOIN public.segmen_tiang st ON st.segmen_id = s.id
  LEFT JOIN LATERAL (
    SELECT DISTINCT tiang_id FROM public.tiang_kondisi_terakhir k2
    WHERE k2.tiang_id = st.tiang_id
  ) k ON true
  WHERE s.status = 'aktif'
  GROUP BY s.id, s.nama, s.penyulang, s.ulp
)
SELECT
  p.*,
  round(100.0 * p.tiang_dinilai / NULLIF(p.tiang, 0), 1) AS persen_dinilai,
  (SELECT max(COALESCE(m.tgl_selesai, m.tgl_mulai))
     FROM public.inspeksi_jtm m
    WHERE m.segmen_id = p.segmen_id AND m.status = 'Diverifikasi') AS terakhir_disapu,
  (SELECT max(COALESCE(m.tgl_selesai, m.tgl_mulai))
     FROM public.inspeksi_jtm m
    WHERE m.segmen_id = p.segmen_id AND m.status = 'Diverifikasi') AS terakhir_inspeksi
FROM per_segmen p;


-- ── 5. Hak akses ─────────────────────────────────────────────────────────────
-- Fungsi yang berganti nama KEHILANGAN grant-nya: hak akses melekat pada nama,
-- bukan pada isinya. Tanpa bagian ini semuanya jadi 'permission denied' —
-- dan galatnya muncul di aplikasi, bukan di sini.

GRANT SELECT ON public.jtr_inspeksi  TO authenticated;
GRANT SELECT ON public.jtr_penyapuan TO authenticated;
GRANT SELECT ON public.jtr_cakupan   TO authenticated;
GRANT SELECT ON public.jtm_cakupan   TO authenticated;

GRANT EXECUTE ON FUNCTION public.mulai_inspeksi_jtm        TO authenticated;
GRANT EXECUTE ON FUNCTION public.selesaikan_inspeksi_jtm   TO authenticated;
GRANT EXECUTE ON FUNCTION public.putuskan_inspeksi_jtm     TO authenticated;
GRANT EXECUTE ON FUNCTION public.gabung_inspeksi_jtm       TO authenticated;
GRANT EXECUTE ON FUNCTION public.buang_inspeksi_kosong_jtm TO authenticated;
GRANT EXECUTE ON FUNCTION public.selesaikan_inspeksi_jtr   TO authenticated;

GRANT EXECUTE ON FUNCTION public.mulai_penyapuan_jtm        TO authenticated;
GRANT EXECUTE ON FUNCTION public.selesaikan_penyapuan_jtm   TO authenticated;
GRANT EXECUTE ON FUNCTION public.putuskan_penyapuan_jtm     TO authenticated;
GRANT EXECUTE ON FUNCTION public.gabung_penyapuan_jtm       TO authenticated;
GRANT EXECUTE ON FUNCTION public.buang_penyapuan_kosong_jtm TO authenticated;
GRANT EXECUTE ON FUNCTION public.selesaikan_penyapuan       TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Nama baru dan pembungkusnya HARUS sama-sama ada (12 baris):
--      SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public'
--        AND (proname LIKE '%penyapuan%' OR proname LIKE '%inspeksi_jt%')
--      ORDER BY proname;
--
-- b. Dua view menunjuk isi yang sama — HARUS 0:
--      SELECT count(*) FROM (
--        SELECT * FROM jtr_penyapuan EXCEPT SELECT * FROM jtr_inspeksi) x;
--
-- c. Kolom lama dan baru harus sama angkanya — HARUS 0:
--      SELECT count(*) FROM jtr_cakupan
--      WHERE pernah_disapu IS DISTINCT FROM pernah_diinspeksi
--         OR disapu_12_bulan IS DISTINCT FROM diinspeksi_12_bulan;
--
-- d. Pembungkus benar-benar bekerja — panggil lewat nama LAMA, lalu periksa
--    barisnya lewat nama BARU:
--      SELECT selesaikan_penyapuan('AM001', 'AMPENAN', NULL, 'uji');
--      SELECT gardu_kode, status FROM jtr_inspeksi WHERE gardu_kode = 'AM001';
-- =============================================================================
