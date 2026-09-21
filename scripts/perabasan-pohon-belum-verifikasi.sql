-- =============================================================================
-- Pohon perabasan: ikut tampil meski inspeksinya belum diverifikasi
-- Jalankan SESUDAH `wo-perabasan.sql`. Idempoten.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
-- Bapak 21 Sep: "di PERUMNAS kan ada temuan pohon, tapi di WO perabasan kok
-- tidak muncul ya pohonnya."
--
-- Datanya memang ada. Diperiksa langsung: 19 jawaban vegetasi tercatat, dua di
-- antaranya "berpotensi" — Ketapang dan Mangga. Yang menghalangi aturan yang
-- SAYA pasang sendiri.
--
-- `perabasan_pohon` dibangun di atas `tiang_kondisi_terakhir`, dan view itu
-- menyaring `WHERE m.status = 'Diverifikasi'`. Padahal DELAPAN inspeksi JTM
-- yang ada semuanya masih 'Dalam Proses' — belum satu pun pernah diverifikasi.
-- Jadi daftar pohonnya kosong, dan akan tetap kosong berbulan-bulan.
--
-- ── KENAPA ATURAN ITU KELIRU DI SINI ────────────────────────────────────────
-- Menunggu verifikasi masuk akal untuk KONDISI TIANG: di sana jawabannya jadi
-- catatan resmi keadaan aset, dan catatan resmi memang harus diperiksa orang
-- lebih dulu.
--
-- Untuk pohon, tidak. Regu rabas toh berangkat ke segmen itu; mengetahui ada
-- Ketapang di tiang MTR-014 membantunya, dan status verifikasi inspeksinya
-- tidak mengubah apa pun yang dia kerjakan di sana. Yang ditahan bukan
-- keputusan berisiko — cuma keterangan yang berguna.
--
-- Karena itu saringannya dilonggarkan, TAPI asalnya ikut dibawa:
-- `status_inspeksi` dan `terverifikasi` disertakan supaya layar bisa
-- mengatakannya. Menampilkan data yang belum diperiksa tanpa menyebut bahwa
-- dia belum diperiksa adalah hal yang berbeda sama sekali.
--
-- Yang tetap dibuang: inspeksi berstatus 'Dibatalkan'. Itu memang dinyatakan
-- keliru oleh orang, bukan sekadar belum sempat diperiksa.
-- =============================================================================

CREATE OR REPLACE VIEW public.perabasan_pohon AS
WITH per_titik AS (
  SELECT
    tk.tiang_id,
    m.status                                                 AS status_inspeksi,
    COALESCE(m.tgl_selesai, m.tgl_mulai)                     AS tgl,
    max(p.nilai) FILTER (WHERE p.item_kode = 'vegetasi')     AS vegetasi,
    max(p.nilai) FILTER (WHERE p.item_kode = 'jenis_pohon')  AS jenis_pohon,
    -- Satu tiang bisa diperiksa berkali-kali. Yang dipakai jawaban TERBARU —
    -- pohon yang sudah dirabas bulan lalu dan dicatat "aman" pada inspeksi
    -- berikutnya tidak boleh muncul lagi hanya karena catatan lamanya ada.
    row_number() OVER (
      PARTITION BY tk.tiang_id
      ORDER BY COALESCE(m.tgl_selesai, m.tgl_mulai) DESC NULLS LAST, tk.id DESC
    )                                                        AS urut
  FROM public.inspeksi_jtm_titik tk
  JOIN public.inspeksi_jtm m         ON m.id = tk.inspeksi_id
  JOIN public.inspeksi_jtm_periksa p ON p.titik_id = tk.id
  WHERE p.item_kode IN ('vegetasi', 'jenis_pohon')
    AND m.status <> 'Dibatalkan'
  GROUP BY tk.tiang_id, tk.id, m.status, m.tgl_selesai, m.tgl_mulai
)
SELECT
  st.segmen_id,
  x.tiang_id,
  t.kode  AS tiang_kode,
  t.lat,
  t.lng,
  x.vegetasi,
  x.jenis_pohon,
  x.tgl   AS tgl_inspeksi,
  x.status_inspeksi,
  -- Dibawa sampai ke HP. Regu berhak tahu bahwa keterangan ini berasal dari
  -- inspeksi yang belum diperiksa siapa pun.
  (x.status_inspeksi = 'Diverifikasi') AS terverifikasi
FROM per_titik x
JOIN public.segmen_tiang st ON st.tiang_id = x.tiang_id
JOIN public.tiang t         ON t.id = x.tiang_id
WHERE x.urut = 1
  AND x.vegetasi IN ('berpotensi', 'menyentuh');

COMMENT ON VIEW public.perabasan_pohon IS
  'Pohon yang menunggu dirabas per segmen, dari jawaban vegetasi inspeksi JTM. Inspeksi yang BELUM diverifikasi ikut tampil — regu toh berangkat ke segmen itu — tapi `terverifikasi` menyebutkannya supaya layar bisa menandainya. Yang Dibatalkan tidak ikut.';

GRANT SELECT ON public.perabasan_pohon TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Pohon per segmen — PERUMNAS seharusnya muncul sekarang:
--      SELECT s.penyulang, s.nama, p.tiang_kode, p.jenis_pohon, p.vegetasi,
--             p.status_inspeksi, p.terverifikasi
--      FROM perabasan_pohon p
--      JOIN segmen s ON s.id = p.segmen_id
--      ORDER BY s.penyulang, s.nama;
--
-- b. Berapa yang berasal dari inspeksi yang belum diverifikasi:
--      SELECT terverifikasi, count(*) FROM perabasan_pohon GROUP BY 1;
--
-- c. Kalau nanti daftar ini ingin dikembalikan ke "yang diverifikasi saja",
--    cukup tambahkan `AND x.status_inspeksi = 'Diverifikasi'` di WHERE terakhir.
-- =============================================================================
