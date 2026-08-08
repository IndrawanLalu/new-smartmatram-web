-- =============================================================================
-- RPC: dashboard_ringkas — agregasi /admin/dashboard di sisi database
-- Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- MASALAHNYA
-- Dashboard menarik ~9.500 baris ke browser hanya untuk menghasilkan sekitar
-- 40 angka: inspeksi 2.071, inspeksi_pohon 3.534, gardu_master_state 2.526,
-- pengukuran_gardu 1.261. Karena `fetchAllRows` memaginasi berurutan, itu jadi
-- belasan request bolak-balik sebelum satu angka pun tampil. Menghitungnya di
-- tempat datanya berada memangkasnya jadi satu panggilan ~1,6 KB.
--
-- YANG TETAP DI KLIEN, dan alasannya
--   - Gangguan penyulang → sumbernya Google Sheets, bukan Postgres.
--   - Ringkasan Yantek   → sumbernya berkas JSON di server, sudah diringkas
--                          lewat /api/yantek/ringkas.
--   - daily_feeder_risk  → sudah disaring satu tanggal, ukurannya kecil.
--   - wo_item            → 233 baris, 0 KB setelah gzip. Tidak ada yang dibeli
--                          dengan memindahkannya, dan `buildWoStats` di TS
--                          adalah satu-satunya definisi tahapan WO.
--
-- AMBANGNYA DIKIRIM SEBAGAI PARAMETER, tidak ditanam di sini.
-- Kalau ditanam, ambang overload hidup di dua tempat (TS dan SQL) dan cepat
-- atau lambat keduanya berbeda — persis kelas bug yang baru kita bereskan pada
-- kVA pemerataan. TypeScript tetap satu-satunya pemilik angka ambang.
--
-- ── TANGGAL: skemanya BERCAMPUR, dan itu menentukan bentuk kueri ini ─────────
--   text : pengukuran_gardu.tanggal_pengukuran
--          inspeksi.tgl_inspeksi, inspeksi.tgl_eksekusi
--          inspeksi_pohon.tgl_inspeksi, inspeksi_pohon.tgl_eksekusi
--   date : penyeimbangan_gardu.tgl_penyeimbangan
--          padam_apkt.tgl_padam
--          gardu_master_state.event_date
--
-- Versi pertama skrip ini gagal dengan `UNION types text and date cannot be
-- matched` justru karena percampuran itu. Penyelesaiannya: kolom text
-- dibandingkan SEBAGAI TEXT (formatnya YYYY-MM-DD panjang 10 untuk seluruh
-- 5.605 baris yang diperiksa, jadi urutan abjadnya sama dengan urutan waktu —
-- ini juga yang dilakukan kode TypeScript), sedangkan kolom date dibandingkan
-- sebagai date. Yang dikonversi hanya di titik pertemuannya.
--
-- Kolom text sengaja TIDAK dibungkus fungsi apa pun pada klausa WHERE — sekali
-- dibungkus, indeks btree-nya tidak terpakai dan agregasinya kembali memindai
-- tabel penuh.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.dashboard_ringkas(
  p_from          date,
  p_to            date,
  p_prev_from     date,
  p_prev_to       date,
  p_ulp           text,          -- '' atau NULL = semua ULP
  p_overload_pct  numeric,       -- OVERLOAD_PCT di TS
  p_suhu_c        numeric,       -- HIGH_TEMP_C di TS
  p_basi_tinggi   int,           -- AMBANG_BASI.bulanTinggi
  p_basi_rendah   int            -- AMBANG_BASI.bulanRendah
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER          -- RLS pemanggil tetap berlaku; fungsi ini tidak
                          -- membuka data yang tidak boleh ia baca.
AS $$
WITH
unit AS (SELECT nullif(upper(coalesce(p_ulp, '')), '') AS u),

-- Parameter dalam bentuk text, untuk dibandingkan dengan kolom bertipe text.
-- `to_char` dipakai, bukan `::text`, supaya hasilnya tidak bergantung DateStyle
-- server.
par AS (
  SELECT to_char(p_from,      'YYYY-MM-DD') AS f,
         to_char(p_to,        'YYYY-MM-DD') AS t,
         to_char(p_prev_from, 'YYYY-MM-DD') AS pf,
         to_char(p_prev_to,   'YYYY-MM-DD') AS pt,
         to_char(date_trunc('month', current_date) - interval '11 months',
                 'YYYY-MM-DD')              AS tren_awal
),

-- Batas "pengukuran sudah basi", tetap bertipe date karena dibandingkan dengan
-- `gardu_master_state.event_date` yang juga date.
batas AS (
  SELECT (current_date - (p_basi_tinggi || ' months')::interval)::date AS b_tinggi,
         (current_date - (p_basi_rendah || ' months')::interval)::date AS b_rendah
),

-- ── Inspeksi jaringan & pohon ───────────────────────────────────────────────
-- Digabung karena kartu dashboard memang menjumlahkan keduanya. Kedua tabel
-- menyimpan tanggal sebagai text, jadi UNION-nya seragam tanpa konversi.
insp AS (
  SELECT tgl_inspeksi, tgl_eksekusi, status, nama_inspektor,
         NULL::text AS tingkat_risiko, 'jaringan'::text AS jenis
  FROM inspeksi
  WHERE (SELECT u FROM unit) IS NULL OR upper(ulp) = (SELECT u FROM unit)
  UNION ALL
  SELECT tgl_inspeksi, tgl_eksekusi, status, nama_inspektor,
         tingkat_risiko, 'pohon'::text AS jenis
  FROM inspeksi_pohon
  WHERE (SELECT u FROM unit) IS NULL OR upper(ulp) = (SELECT u FROM unit)
),

-- ── Pengukuran & pemerataan ─────────────────────────────────────────────────
-- Pemerataan dihitung sebagai pengukuran: petugas memang mengukur ulang setelah
-- memindah jurusan. Aturan yang sama dipakai halaman pengukuran-gardu.
--
-- Di sinilah text bertemu date. Sisi pemerataan yang dikonversi ke text, bukan
-- sebaliknya, supaya kolom `tanggal_pengukuran` (1.261 baris, ada indeksnya)
-- tetap bisa dibandingkan apa adanya.
kegiatan AS (
  SELECT no_gardu, tanggal_pengukuran AS tgl, petugas_nama AS nama
  FROM pengukuran_gardu
  WHERE (SELECT u FROM unit) IS NULL OR upper(petugas_unit) = (SELECT u FROM unit)
  UNION ALL
  SELECT no_gardu, to_char(tgl_penyeimbangan, 'YYYY-MM-DD') AS tgl,
         petugas_penyeimbang AS nama
  FROM penyeimbangan_gardu
  WHERE (SELECT u FROM unit) IS NULL OR upper(ulp) = (SELECT u FROM unit)
),

merata AS (
  SELECT no_gardu, beban_pct_before, beban_pct_after,
         beban_pct_before - beban_pct_after AS turun
  FROM penyeimbangan_gardu
  WHERE tgl_penyeimbangan BETWEEN p_from AND p_to
    AND ((SELECT u FROM unit) IS NULL OR upper(ulp) = (SELECT u FROM unit))
),

-- ── Kondisi armada, dari master ─────────────────────────────────────────────
-- Persen beban dibandingkan pada angka yang TAMPIL (dibulatkan), sama dengan
-- `isOverload` di TS. Tanpa itu gardu bertulisan "80%" tidak ikut terhitung.
armada AS (
  SELECT kode, ulp, persen_beban, suhu_trafo, event_type, event_date, belum_diukur,
         round(coalesce(persen_beban, 0)) AS persen_tampil
  FROM gardu_master_state
  WHERE (SELECT u FROM unit) IS NULL OR upper(ulp) = (SELECT u FROM unit)
),
terukur  AS (SELECT * FROM armada  WHERE NOT belum_diukur),
overload AS (SELECT * FROM terukur WHERE persen_tampil >= p_overload_pct),

-- ── Padam APKT ──────────────────────────────────────────────────────────────
padam AS (
  SELECT * FROM padam_apkt
  WHERE tgl_padam BETWEEN p_from AND p_to
    AND ((SELECT u FROM unit) IS NULL OR upper(ulp) = (SELECT u FROM unit))
)

SELECT jsonb_build_object(

  'kpi', jsonb_build_object(
    'inspeksiNow',  (SELECT count(*) FROM insp, par WHERE tgl_inspeksi BETWEEN par.f  AND par.t),
    'inspeksiPrev', (SELECT count(*) FROM insp, par WHERE tgl_inspeksi BETWEEN par.pf AND par.pt),
    'garduNow',     (SELECT count(DISTINCT no_gardu) FROM kegiatan, par WHERE tgl BETWEEN par.f  AND par.t),
    'garduPrev',    (SELECT count(DISTINCT no_gardu) FROM kegiatan, par WHERE tgl BETWEEN par.pf AND par.pt),
    'merataNow',    (SELECT count(*) FROM penyeimbangan_gardu
                      WHERE tgl_penyeimbangan BETWEEN p_from AND p_to
                        AND ((SELECT u FROM unit) IS NULL OR upper(ulp) = (SELECT u FROM unit))),
    'merataPrev',   (SELECT count(*) FROM penyeimbangan_gardu
                      WHERE tgl_penyeimbangan BETWEEN p_prev_from AND p_prev_to
                        AND ((SELECT u FROM unit) IS NULL OR upper(ulp) = (SELECT u FROM unit)))
  ),

  -- Tren 12 bulan untuk sparkline, berkunci 'YYYY-MM'. Bulan tanpa kegiatan
  -- tidak muncul; klien yang menyusun kerangka 12 bulannya, jadi bolongnya
  -- jadi nol di sana.
  'tren', jsonb_build_object(
    'inspeksi', (SELECT coalesce(jsonb_object_agg(bln, n), '{}'::jsonb) FROM (
        SELECT left(tgl_inspeksi, 7) AS bln, count(*) AS n
        FROM insp, par
        WHERE tgl_inspeksi >= par.tren_awal
        GROUP BY 1) t),
    'gardu', (SELECT coalesce(jsonb_object_agg(bln, n), '{}'::jsonb) FROM (
        SELECT left(tgl, 7) AS bln, count(*) AS n
        FROM kegiatan, par
        WHERE tgl >= par.tren_awal
        GROUP BY 1) t)
  ),

  'inspeksi', jsonb_build_object(
    'jaringanBaru', (SELECT count(*) FROM insp, par WHERE jenis = 'jaringan' AND tgl_inspeksi BETWEEN par.f AND par.t),
    'pohonBaru',    (SELECT count(*) FROM insp, par WHERE jenis = 'pohon'    AND tgl_inspeksi BETWEEN par.f AND par.t),
    -- Terbuka TANPA batas tanggal: temuan 2024 yang belum ditutup tetap
    -- tunggakan hari ini. Kalau ikut disaring jendela, angkanya menyusut
    -- sendiri seiring waktu berjalan.
    'terbuka',      (SELECT count(*) FROM insp WHERE status <> 'Selesai'),
    'selesai',      (SELECT count(*) FROM insp, par WHERE status = 'Selesai' AND tgl_eksekusi BETWEEN par.f AND par.t),
    'byStatus',     (SELECT coalesce(jsonb_agg(jsonb_build_object('status', status, 'jumlah', n) ORDER BY n DESC), '[]'::jsonb)
                     FROM (SELECT status, count(*) AS n FROM insp WHERE status <> 'Selesai' GROUP BY 1) t),
    'risikoSangatTinggi', (SELECT count(*) FROM insp
                            WHERE jenis = 'pohon' AND status <> 'Selesai'
                              AND tingkat_risiko = 'Sangat Tinggi')
  ),

  'gardu', jsonb_build_object(
    'totalMaster',    (SELECT count(*) FROM armada),
    'terukur',        (SELECT count(*) FROM terukur),
    'belumDiukur',    (SELECT count(*) FROM armada WHERE belum_diukur),
    'perluUkurUlang', (SELECT count(*) FROM terukur, batas
                        WHERE event_date IS NOT NULL
                          AND CASE WHEN persen_tampil >= p_overload_pct
                                   THEN event_date < batas.b_tinggi
                                   ELSE event_date < batas.b_rendah END),
    'overload',                 (SELECT count(*) FROM overload),
    'overloadDariPemeliharaan', (SELECT count(*) FROM overload WHERE event_type = 'penyeimbangan'),
    'overloadDiPeriode',        (SELECT count(*) FROM overload WHERE event_date BETWEEN p_from AND p_to),
    'suhuTinggi',     (SELECT count(*) FROM terukur WHERE coalesce(suhu_trafo, 0) >= p_suhu_c),
    'avgBeban',       (SELECT coalesce(avg(persen_beban), 0) FROM terukur),
    -- Nilai beban dikirim sebagai deret angka bulat, bukan sudah diember.
    -- Definisi embernya milik komponen donat di TS; menyalinnya ke SQL berarti
    -- dua tempat yang harus diubah bersamaan.
    'bebanValues',    (SELECT coalesce(jsonb_agg(persen_tampil), '[]'::jsonb) FROM terukur),
    'overloadTeratas',(SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'kode', kode, 'ulp', ulp, 'persen', persen_beban,
                          'tanggal', to_char(event_date, 'YYYY-MM-DD'),
                          'dariPemeliharaan', event_type = 'penyeimbangan')), '[]'::jsonb)
                       FROM (SELECT * FROM overload ORDER BY persen_beban DESC LIMIT 8) t),
    'diukur',         (SELECT count(DISTINCT no_gardu) FROM kegiatan, par WHERE tgl BETWEEN par.f AND par.t),
    'barisPengukuran',(SELECT count(*) FROM kegiatan, par WHERE tgl BETWEEN par.f AND par.t)
  ),

  'pemerataan', jsonb_build_object(
    'selesai',           (SELECT count(*) FROM merata),
    'perbaikanRataRata', (SELECT coalesce(avg(turun), 0) FROM merata),
    'terbaik',           (SELECT to_jsonb(t) FROM (
                            SELECT no_gardu, beban_pct_before AS before, beban_pct_after AS after
                            FROM merata ORDER BY turun DESC LIMIT 1) t)
  ),

  'padam', jsonb_build_object(
    'total',          (SELECT count(*) FROM padam),
    'pelangganPadam', (SELECT coalesce(sum(jml_pelanggan_padam), 0) FROM padam),
    'ens',            (SELECT coalesce(sum(ens), 0) FROM padam),
    'durasiRataRata', (SELECT coalesce(avg(lama_padam_jam), 0) FROM padam WHERE lama_padam_jam > 0),
    'topPenyebab',    (SELECT coalesce(jsonb_agg(jsonb_build_object('nama', nama, 'jumlah', n) ORDER BY n DESC), '[]'::jsonb)
                       FROM (SELECT penyebab_padam AS nama, count(*) AS n FROM padam
                             WHERE coalesce(btrim(penyebab_padam), '') <> '' GROUP BY 1
                             ORDER BY n DESC LIMIT 5) t)
  ),

  'produktivitas', (
    -- Satu petugas dihitung dari pengukuran, pemerataan, DAN inspeksi.
    --
    -- Jumlah orangnya dan lima teratas dikembalikan terpisah. Versi pertama
    -- mengirim seluruh 37 baris padahal kartunya hanya memakai lima — dan
    -- nama regu di sini panjang ("SUHERMAN & SUHERMAN (ODON)"), jadi 32 baris
    -- sisanya menyumbang muatan tanpa pernah terbaca.
    WITH orang AS (
      SELECT nama, count(*) AS n FROM (
        SELECT nama FROM kegiatan, par WHERE tgl BETWEEN par.f AND par.t
        UNION ALL
        SELECT nama_inspektor AS nama FROM insp, par WHERE tgl_inspeksi BETWEEN par.f AND par.t
      ) s
      WHERE coalesce(btrim(nama), '') <> ''
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'totalPetugas', (SELECT count(*) FROM petugas WHERE status = 'aktif'),
      'petugasAktif', (SELECT count(*) FROM orang),
      'top', (SELECT coalesce(jsonb_agg(jsonb_build_object('nama', nama, 'jumlah', n) ORDER BY n DESC), '[]'::jsonb)
              FROM (SELECT * FROM orang ORDER BY n DESC LIMIT 5) t)
    )
  )
);
$$;

COMMENT ON FUNCTION public.dashboard_ringkas IS
  'Agregasi /admin/dashboard. Menggantikan ~9.500 baris yang dulu ditarik ke browser. Ambang dikirim sebagai parameter agar TypeScript tetap satu-satunya pemilik angka ambang.';

-- Boleh dipanggil pengguna yang sudah login. SECURITY INVOKER, jadi RLS
-- masing-masing tabel tetap berlaku.
GRANT EXECUTE ON FUNCTION public.dashboard_ringkas(
  date, date, date, date, text, numeric, numeric, int, int
) TO authenticated;

-- Indeks penopang. Tanpa ini agregasinya memindai tabel penuh setiap kali
-- periode diganti. Kolom tanggal yang bertipe text tetap terindeks dengan baik
-- karena dibandingkan apa adanya, tanpa dibungkus fungsi.
CREATE INDEX IF NOT EXISTS inspeksi_tgl_inspeksi_idx        ON inspeksi (tgl_inspeksi);
CREATE INDEX IF NOT EXISTS inspeksi_tgl_eksekusi_idx        ON inspeksi (tgl_eksekusi);
CREATE INDEX IF NOT EXISTS inspeksi_status_idx              ON inspeksi (status);
CREATE INDEX IF NOT EXISTS inspeksi_pohon_tgl_inspeksi_idx  ON inspeksi_pohon (tgl_inspeksi);
CREATE INDEX IF NOT EXISTS inspeksi_pohon_tgl_eksekusi_idx  ON inspeksi_pohon (tgl_eksekusi);
CREATE INDEX IF NOT EXISTS inspeksi_pohon_status_idx        ON inspeksi_pohon (status);
CREATE INDEX IF NOT EXISTS pengukuran_tanggal_idx           ON pengukuran_gardu (tanggal_pengukuran);
CREATE INDEX IF NOT EXISTS penyeimbangan_tgl_idx            ON penyeimbangan_gardu (tgl_penyeimbangan);
CREATE INDEX IF NOT EXISTS padam_apkt_tgl_idx               ON padam_apkt (tgl_padam);

-- ── Uji ──────────────────────────────────────────────────────────────────────
-- Sudah dijalankan 8 Agustus 2026 dan seluruh angkanya dicocokkan satu per satu
-- dengan hitungan bebas di sisi klien atas tabel yang sama — cocok semuanya:
--   kpi.inspeksiNow 599 · inspeksiPrev 517 · garduNow 43 · garduPrev 16
--   inspeksi.terbuka 1070 · selesai 573 · risikoSangatTinggi 33
--   gardu.totalMaster 2526 · terukur 1006 · belumDiukur 1520
--   gardu.overload 12 · overloadDariPemeliharaan 1 · avgBeban 40,285
--   produktivitas.totalPetugas 88 · petugasAktif 37
--
-- SELECT jsonb_pretty(dashboard_ringkas(
--   '2026-08-01', '2026-08-08', '2026-07-01', '2026-07-08',
--   '', 80, 60, 3, 5));
--
-- ── CATATAN dari hasil uji: 11 baris berstatus di luar daftar resmi ──────────
-- `inspeksi_pohon` memuat status "PetaPohon" (10 baris) dan "Proses" (1 baris),
-- di luar lima status yang dikenal aplikasi (Temuan · Perlu Tindakan ·
-- Ditugaskan · Dalam Proses · Selesai). Karena bukan "Selesai", kesebelasnya
-- ikut terhitung sebagai tunggakan pada `inspeksi.terbuka`. "Proses" tampak
-- salah tulis dari "Dalam Proses"; "PetaPohon" bukan status sama sekali.
-- Fungsi ini sengaja TIDAK menyaringnya — menyembunyikan data janggal membuat
-- masalahnya awet. Perlu dibereskan di sumbernya (aplikasi mobile).
