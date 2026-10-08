-- =============================================================================
-- Panduan istilah per modul (8 Okt 2026) — dimulai dari Inspeksi JTR.
-- Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- User: "di halaman JTR bisa dibuatkan halaman panduan: istilah, maksud dari
-- istilah, dan kapan dipakai, semacam FAQ … saya juga sering lupa jika ditanya
-- tim. Updatenya lewat web."
--
--   • Dibaca semua pengguna (HP menyimpan salinannya untuk dibuka tanpa sinyal).
--   • Diubah hanya UP3 / admin, dari tab Panduan di web.
--   • `modul` supaya JTM dan modul lain bisa menyusul tanpa tabel baru.
--   • Isi awal JTR di bawah; ON CONFLICT DO NOTHING — isi yang sudah disunting
--     dari web TIDAK ditimpa bila skrip dijalankan ulang.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.panduan (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modul       TEXT NOT NULL,
  kelompok    TEXT NOT NULL,
  istilah     TEXT NOT NULL,
  maksud      TEXT NOT NULL,
  kapan       TEXT,
  contoh      TEXT,
  urutan      INT  NOT NULL DEFAULT 0,
  aktif       BOOLEAN NOT NULL DEFAULT true,
  diubah_oleh TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS panduan_istilah_unik ON public.panduan (modul, lower(istilah));
CREATE INDEX IF NOT EXISTS panduan_modul_idx ON public.panduan (modul, urutan);

COMMENT ON TABLE public.panduan IS
  'Panduan istilah per modul (istilah, maksud, kapan dipakai, contoh). Tampil di HP (tombol Panduan) dan tab Panduan di web; disunting UP3/admin dari web.';

CREATE OR REPLACE FUNCTION public.panduan_cap_waktu()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_panduan_cap_waktu ON public.panduan;
CREATE TRIGGER trg_panduan_cap_waktu BEFORE UPDATE ON public.panduan
  FOR EACH ROW EXECUTE FUNCTION public.panduan_cap_waktu();

ALTER TABLE public.panduan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS panduan_baca ON public.panduan;
CREATE POLICY panduan_baca ON public.panduan FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS panduan_ubah ON public.panduan;
CREATE POLICY panduan_ubah ON public.panduan FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('UP3', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('UP3', 'admin')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.panduan TO authenticated;


-- ── Isi awal: Inspeksi JTR ───────────────────────────────────────────────────
INSERT INTO public.panduan (modul, kelompok, istilah, maksud, kapan, contoh, urutan) VALUES
-- Dasar penamaan
('jtr', 'Dasar penamaan', 'Jurusan',
 'Huruf jalur keluar di panel/PHB gardu: A, B, C, atau D. Bukan arah mata angin. Jurusan K tidak dipakai lagi.',
 'Pilih huruf jurusan di baris atas sebelum menitik, sesuai tulisan di panel gardu.',
 'Jurusan B dan C bisa sama-sama menuju timur — tetap dicatat B dan C sesuai panel.', 10),
('jtr', 'Dasar penamaan', 'Tiang pertama dari gardu',
 'Tiang pertama sebuah jurusan, kabelnya langsung dari gardu. Nomornya mulai 2 (nomor 1 dianggap gardu).',
 'Titik tiang pertama tanpa memilih tiang lain di peta.',
 'AM104-A2', 20),
('jtr', 'Dasar penamaan', 'Disambung dari',
 'Tiang sebelumnya, tempat kabel tiang baru datang. Otomatis tiang terakhir yang dititik di jurusan itu; tampil di bilah bawah peta.',
 'Kalau jalur bercabang dari tiang lain, ketuk dulu tiang itu di peta, baru titik tiang baru.',
 'Disambung dari AM104-A4', 30),
('jtr', 'Dasar penamaan', 'Nama tiang',
 'Dibuat server saat Kirim, tidak diketik regu. Lurus = nomor lanjut; belok tajam atau cabang = nomor cabang; tiang sisipan = huruf kecil.',
 'Tidak ada yang perlu diisi — nama muncul setelah tiang terkirim.',
 'Lurus: A5, A6 · Cabang: A4B1, A4_C1 · Sisipan: A3a', 40),
('jtr', 'Dasar penamaan', 'Jalur baru dari gardu',
 'Jalur kedua (atau ketiga) dari gardu di jurusan yang SAMA. Diberi akhiran jalur supaya tidak tertukar dengan jalur pertama.',
 'Tekan "Jalur baru dari gardu" di bilah atas peta, lalu titik tiang pertamanya.',
 'Jalur kedua C: C2-2, C3-2, … · jalur ketiga: C2-3, …', 50),

-- Tiang bersama
('jtr', 'Tiang bersama', 'Menumpang',
 'Kabel JTR gardu ini lewat batang milik pihak lain: tiang JTM, atau tiang JTR gardu lain. Batangnya tidak dititik ulang; gardu ini hanya memberi nama di jaringannya sendiri.',
 'Tombol "Menumpang", atau pilih "Tumpangi …" saat HP bertanya "Di sini sudah ada tiang".',
 'JTR digantung di tiang JTM penyulang AMPENAN.', 110),
('jtr', 'Tiang bersama', 'Dilewati jurusan … juga',
 'Satu tiang milik gardu ini dilewati DUA jurusan panel berbeda di jalur yang sama. Tiang masuk deret kedua jurusan dan kabel jurusan kedua ikut dicatat — cukup sekali jalan. Sama dengan "dua jurusan satu tiang".',
 'Tiang baru: centang "Juga dilewati jurusan B" di atas formulir. Tiang yang sudah ada: pilih jurusan B, ketuk tiang kelabu di peta → "Dilewati jurusan B juga".',
 'Jurusan A dan B berangkat bersama: A2/B2, A3/B3, lalu B belok jadi B5, B6.', 120),
('jtr', 'Tiang bersama', 'Nama gabungan',
 'Nama tiang yang dilewati beberapa jurusan, diurutkan menurut posisi kabel. Dibuat server.',
 'Otomatis setelah tiang ditandai "dilewati jurusan" dan dikirim.',
 'AM104-A4/B5 · tiga jurusan: AM104-A4/B5/C3', 130),
('jtr', 'Tiang bersama', 'Tiang kelabu di peta',
 'Tiang jurusan lain dari gardu ini. Tampil supaya bisa diketuk, bukan untuk dikerjakan di jurusan yang sedang dipilih.',
 'Ketuk bila jurusan yang sedang Anda sapu juga lewat tiang itu.', NULL, 140),
('jtr', 'Tiang bersama', 'Menumpang atau dilewati jurusan?',
 'Menumpang = batang milik pihak LAIN (JTM / gardu lain). Dilewati jurusan = tiang milik gardu yang SAMA, dilewati dua jurusan panelnya.',
 'Tanyakan: tiang ini milik siapa? Pihak lain → Menumpang. Gardu ini sendiri → Dilewati jurusan.', NULL, 150),
('jtr', 'Tiang bersama', 'Ada JTM di atasnya',
 'JTR digantung di tiang TM (dulu bernama "Underbuild TM"). Tidak ada hubungannya dengan dua jurusan JTR.',
 'Pilih "Ya" bila tiang ini tiang JTM yang juga memikul JTR.', NULL, 160),
('jtr', 'Tiang bersama', 'Ada JTR gardu lain di tiang ini',
 'Penanda bahwa batang ini juga memikul kabel gardu lain. Kabel gardu lain TIDAK dicatat di sini — dicatat saat gardu itu disapu.',
 'Pilih "Ya" dan isi kode gardunya bila tahu.', 'Kode gardu lain: AM071', 170),
('jtr', 'Tiang bersama', 'Tiang lain, bukan itu',
 'Jawaban saat HP mengira Anda berdiri di tiang yang sudah ada, padahal memang dua batang berbeda. Admin mendapat catatannya.',
 'Hanya bila benar dua batang — misalnya tiang JTR tepat di sebelah tiang JTM.', NULL, 180),

-- Kabel
('jtr', 'Kabel', 'Kabel gardu ini ke-',
 'Urutan kabel gardu ini di tiang. Kabel JTM dan kabel JTR gardu lain TIDAK dihitung. 1 = kabel utama.',
 'Isi di halaman Konduktor tiap tiang.', NULL, 210),
('jtr', 'Kabel', 'Tambah kabel underbuild',
 'Kabel kedua/ketiga gardu ini di tiang yang sama, dari jurusan yang SAMA.',
 'Dua kabel sejurusan berjalan sejajar, atau kabel bertambah di tengah jalan (mis. mulai B6). Tiang berikutnya mewarisi jumlah kabelnya.',
 'Temuan pada kabel kedua disebut B6.2, B7.2, …', 220),
('jtr', 'Kabel', 'Underbuild atau dilewati jurusan?',
 'Kabel kedua SAMA jurusan → Tambah kabel underbuild. Kabel kedua BEDA jurusan → Dilewati jurusan (kabelnya ditambahkan otomatis).',
 'Lihat huruf jurusan kabel di panel gardu.', NULL, 230),
('jtr', 'Kabel', 'Jurusan kabel',
 'Jurusan yang dibawa tiap kabel. Jurusan inilah yang menyambungkan kabel dari tiang ke tiang.',
 'Ditanyakan di tiang yang dilewati beberapa jurusan, dan pada kabel kedua lama yang jurusannya belum tercatat.', NULL, 240),
('jtr', 'Kabel', 'Kabel ini datang dari',
 'Asal kabel. "Ikut jalur" (bawaan) = dari tiang sebelumnya. "Langsung dari gardu" atau tiang lain hanya bila kabel itu memang tidak datang dari tiang sebelumnya.',
 'Dua jalur berdampingan yang berbagi tiang, atau kabel yang keluar langsung dari gardu.', NULL, 250),
('jtr', 'Kabel', 'Kabel ini lanjutan yang mana?',
 'Pertanyaan HP saat tiang sebelumnya membawa beberapa kabel dan tidak satu pun cocok dengan kabel tiang ini. Kalau dibiarkan, panjang bentang itu belum terhitung.',
 'Pilih asal yang diusulkan (tiang terdekat atau gardu), atau betulkan nomor/jurusan kabelnya.', NULL, 260),
('jtr', 'Kabel', 'Jurusan kabel belum dipastikan',
 'Kabel kedua di tiang lama yang jurusannya belum pernah dicatat. Sementara dihitung ikut jurusan tiangnya — KMS tetap aman.',
 'Saat tiangnya diinspeksi ulang, HP menanyakan jurusannya. Jawab sesuai lapangan.', NULL, 270),
('jtr', 'Kabel', 'Panjang rute dan panjang penghantar (KMS)',
 'Rute = panjang jalur, tiap bentang dihitung sekali. Penghantar = panjang kabel; dua kabel di satu bentang dihitung dua kali. KMS WO memakai panjang penghantar.',
 'Dibaca di web, tab Jaringan per Gardu.', NULL, 280),

-- Cara kerja di HP
('jtr', 'Cara kerja di HP', 'Titik tiang di sini (+)',
 'Menambah tiang di posisi GPS Anda. Titiknya dikunci saat formulir dibuka.',
 'Berdiri di bawah tiang, tunggu GPS ±25 m atau lebih baik, lalu tekan tombol + di dalam peta.', NULL, 310),
('jtr', 'Cara kerja di HP', 'Ujung / tengah',
 'Menitik tanpa mulai dari gardu. Tiang tersimpan di HP sebagai "belum tersambung" dan belum bernama.',
 'Mulai dari ujung atau tengah jurusan. Saat sampai di tiang yang sudah ada atau gardu, tekan "Sambungkan".', NULL, 320),
('jtr', 'Cara kerja di HP', 'Tiang baik',
 'Mengisi semua jawaban bawaan sekaligus. Yang sudah diisi tidak ditimpa; isian tanpa bawaan tetap wajib diisi manual.',
 'Untuk tiang yang memang normal semuanya.', NULL, 330),
('jtr', 'Cara kerja di HP', 'Ubah, Hapus, Lepas',
 'Ketuk tiangnya di peta; tombolnya muncul di bawah peta. Hapus = tiang salah input. Lepas = batang pinjaman atau jurusan yang lewat dilepas, tiangnya tetap.',
 'Hapus dari tiang paling ujung dulu, mundur ke tiang yang salah.', NULL, 340),
('jtr', 'Cara kerja di HP', 'Simpan di HP, Kirim tiang, Selesai inspeksi',
 'Simpan di HP = tersimpan di HP saja. Kirim tiang = masuk server, inspeksi tetap terbuka. Selesai inspeksi = semua tiang sudah dinilai, dikirim ke admin, gardu hanya bisa dilihat.',
 'Kirim tiang kapan saja ada sinyal; Selesai inspeksi sekali di akhir.', NULL, 350),
('jtr', 'Cara kerja di HP', 'Foto temuan',
 'Bukti untuk setiap jawaban yang tidak normal. Tanpa foto, tiang tidak bisa disimpan.',
 'Muncul sendiri saat memilih jawaban temuan; boleh sampai 3 foto.', NULL, 360),
('jtr', 'Cara kerja di HP', 'Dikembalikan admin',
 'Admin menolak hasil inspeksi dengan catatan. Inspeksi yang sama terbuka lagi di HP.',
 'Baca catatannya di layar gardu, perbaiki, lalu kirim lagi.', NULL, 370),

-- Untuk admin
('jtr', 'Untuk admin', 'Asal kabel belum dipilih',
 'Panel di persetujuan untuk kabel yang belum jelas datang dari tiang mana; panjangnya belum terhitung.',
 'Tekan usulannya, atau "Terapkan semua usulan".', NULL, 410),
('jtr', 'Untuk admin', 'Panel jurusan kabel belum dipastikan',
 'Daftar kabel kedua lama yang jurusannya belum tercatat (tab Jaringan per Gardu dan persetujuan).',
 'Boleh diabaikan — regu memastikannya di lapangan. Tekan tombolnya hanya bila yakin dua kabel itu sejurusan.', NULL, 420)
ON CONFLICT DO NOTHING;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT kelompok, count(*) FROM panduan WHERE modul = 'jtr' GROUP BY 1;
