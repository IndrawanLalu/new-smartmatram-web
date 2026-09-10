-- =============================================================================
-- Fase 3.1d — HARGARDU: fungsi
-- Jalankan SESUDAH `hargardu-view.sql`. Idempoten.
--
-- Semua penulisan lewat fungsi SECURITY DEFINER supaya perubahan dan jejak
-- auditnya tidak pernah terpisah. Aplikasi tidak pernah menulis langsung ke
-- master gardu — kalau bisa, koreksi tanpa jejak cuma soal waktu.
-- =============================================================================

-- ── 1. Simpan seluruh jawaban pemeriksaan sekali jalan ──────────────────
-- Sebagai SATU DAFTAR, bukan satu per satu: item yang dihapus di layar harus
-- ikut terhapus di database, dan itu cuma bisa diketahui kalau daftarnya utuh.
-- Pelajaran dari modul JTR, di mana underbuild yang sudah dicabut tetap
-- menghitung panjang penghantar selamanya karena penyimpanannya per baris.

CREATE OR REPLACE FUNCTION public.simpan_periksa_pemeliharaan(
  p_id     UUID,
  p_daftar JSONB,
  p_nama   TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m       RECORD;
  r       JSONB;
  kunci   TEXT[] := '{}';
  jml     INT := 0;
BEGIN
  SELECT * INTO m FROM public.pemeliharaan_gardu WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pemeliharaan tidak ditemukan'; END IF;
  IF m.status IN ('Diverifikasi') THEN
    RAISE EXCEPTION 'Pemeliharaan % sudah diverifikasi dan tidak bisa diubah lagi', m.gardu_kode;
  END IF;

  -- Daftar kosong TIDAK boleh menghapus jawaban yang sudah ada.
  --
  -- Penghapusan di bawah memang disengaja — item yang dihilangkan di layar
  -- harus ikut hilang di sini. Tapi daftar yang kosong hampir tidak pernah
  -- berarti "hapus semuanya"; jauh lebih sering berarti aplikasinya membuka
  -- formulir kosong karena gagal memuat isian tersimpan, lalu menekan Simpan.
  -- Tanpa penjaga ini, satu ketukan menghapus seluruh pemeriksaan satu gardu
  -- tanpa peringatan apa pun.
  IF jsonb_array_length(COALESCE(p_daftar, '[]'::jsonb)) = 0
     AND EXISTS (SELECT 1 FROM public.pemeliharaan_gardu_periksa WHERE pemeliharaan_id = p_id) THEN
    RAISE EXCEPTION
      'Menolak menyimpan daftar pemeriksaan kosong untuk % — gardu ini sudah punya jawaban tersimpan, dan menyimpannya akan menghapus semuanya.',
      m.gardu_kode;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_daftar, '[]'::jsonb)) LOOP
    INSERT INTO public.pemeliharaan_gardu_periksa
      (pemeliharaan_id, item_kode, bagian, nilai, nilai_angka, catatan)
    VALUES (
      p_id,
      r->>'item_kode',
      COALESCE(NULLIF(r->>'bagian', ''), '-'),
      NULLIF(r->>'nilai', ''),
      NULLIF(r->>'nilai_angka', '')::numeric,
      NULLIF(r->>'catatan', ''))
    ON CONFLICT (pemeliharaan_id, item_kode, bagian) DO UPDATE
      SET nilai       = EXCLUDED.nilai,
          nilai_angka = EXCLUDED.nilai_angka,
          catatan     = EXCLUDED.catatan,
          updated_at  = now();

    kunci := kunci || ((r->>'item_kode') || '|' || COALESCE(NULLIF(r->>'bagian', ''), '-'));
    jml := jml + 1;
  END LOOP;

  DELETE FROM public.pemeliharaan_gardu_periksa
  WHERE pemeliharaan_id = p_id
    AND NOT ((item_kode || '|' || bagian) = ANY (kunci));

  UPDATE public.pemeliharaan_gardu
  SET status = CASE WHEN status = 'Dijadwalkan' THEN 'Dalam Proses' ELSE status END,
      petugas_nama = COALESCE(p_nama, petugas_nama),
      updated_at = now()
  WHERE id = p_id;

  RETURN jml;
END $$;

-- ── 2. Spesifikasi terbaca → master gardu ──────────────────────────
-- INTI MODUL INI. Regu membaca nama plat; hasilnya dibandingkan dengan master.
--
--   MASTER KOSONG  → langsung terisi, teraudit. Tidak ada yang dirugikan, dan
--                    menahannya di meja admin justru memperlambat kelengkapan
--                    master — padahal itu yang ingin dipercepat.
--   MASTER BERBEDA → usulan menunggu, master TIDAK berubah. kVA berubah berarti
--                    trafonya pernah diganti, dan angka itu dipakai menghitung
--                    persen beban seluruh sistem.
--
-- Nama kolom tidak pernah datang dari luar tanpa disaring: `DIBOLEHKAN`
-- membatasi kolom mana saja yang boleh disentuh, dan `%I` mengutip namanya.
-- Tanpa dua itu, satu kunci JSON yang jahat bisa menulis ke kolom mana pun.

-- Dibuang dulu, bukan CREATE OR REPLACE: Postgres menolak mengganti susunan
-- kolom keluaran sebuah fungsi. Tanpa baris ini, basis data yang sudah
-- memasang versi lama akan gagal saat skrip dijalankan ulang.
DROP FUNCTION IF EXISTS public.usulkan_spek_gardu(UUID, JSONB, TEXT);

CREATE OR REPLACE FUNCTION public.usulkan_spek_gardu(
  p_pemeliharaan_id UUID,
  p_spek            JSONB,
  p_nama            TEXT DEFAULT NULL
) RETURNS TABLE (kolom TEXT, tindakan TEXT, sebelum TEXT, sesudah TEXT)
-- Nama kolom keluaran SENGAJA tidak memakai `field`/`nilai_lama`/`nilai_baru`:
-- ketiganya juga nama kolom di `master_usulan`, dan di dalam plpgsql yang
-- bentrok begitu ditolak sebagai "column reference is ambiguous" — tapi baru
-- ketahuan saat fungsinya benar-benar dipanggil, bukan saat dibuat.
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  DIBOLEHKAN CONSTANT TEXT[] := ARRAY[
    'daya', 'merk', 'nama', 'alamat', 'no_seri', 'tahun_pembuatan',
    'jenis_gardu', 'phase', 'tegangan_primer', 'tegangan_sekunder',
    'arus_primer', 'arus_sekunder', 'vector',
    'jenis_minyak', 'volume_minyak', 'berat_total', 'tapping', 'pendingin'];
  m     RECORD;
  k     TEXT;
  v     TEXT;
  lama  TEXT;
  tipe  TEXT;
  foto  TEXT[];
  ada   UUID;
BEGIN
  SELECT * INTO m FROM public.pemeliharaan_gardu WHERE id = p_pemeliharaan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pemeliharaan tidak ditemukan'; END IF;

  -- Gardunya harus benar-benar ada di master. Tanpa penjaga ini, pemeliharaan
  -- pada kode gardu yang salah ketik akan melaporkan "dilengkapi" untuk tiap
  -- field padahal tidak ada satu baris pun yang berubah — laporan berhasil
  -- untuk pekerjaan yang tidak menyentuh apa pun.
  IF NOT EXISTS (SELECT 1 FROM public.gardu
                 WHERE upper(kode) = upper(m.gardu_kode) AND upper(ulp) = upper(m.ulp)) THEN
    RAISE EXCEPTION 'Gardu % di ULP % tidak ada di master', m.gardu_kode, m.ulp;
  END IF;

  -- Foto nama plat jadi bukti yang menempel di usulan. Tanpa itu, klaim
  -- "kVA-nya beda" tidak bisa diperiksa admin dari belakang meja — dan koreksi
  -- master yang tidak bisa diperiksa bukan koreksi, cuma tebakan baru.
  SELECT array_agg(url) INTO foto
  FROM public.pemeliharaan_gardu_foto
  WHERE pemeliharaan_id = p_pemeliharaan_id AND slot = 'nama_plat';

  UPDATE public.pemeliharaan_gardu
  SET spek = COALESCE(p_spek, '{}'::jsonb), updated_at = now()
  WHERE id = p_pemeliharaan_id;

  FOR k, v IN SELECT key, value #>> '{}' FROM jsonb_each(COALESCE(p_spek, '{}'::jsonb)) LOOP
    CONTINUE WHEN NOT (k = ANY (DIBOLEHKAN));
    CONTINUE WHEN v IS NULL OR btrim(v) = '';

    SELECT data_type INTO tipe FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gardu' AND column_name = k;
    CONTINUE WHEN tipe IS NULL;

    EXECUTE format(
      'SELECT %I::text FROM public.gardu WHERE upper(kode)=upper($1) AND upper(ulp)=upper($2)', k)
      INTO lama USING m.gardu_kode, m.ulp;

    IF lama IS NULL OR btrim(lama) = '' THEN
      EXECUTE format(
        'UPDATE public.gardu SET %I = $1::%s, updated_at = now()
          WHERE upper(kode)=upper($2) AND upper(ulp)=upper($3)', k, tipe)
        USING v, m.gardu_kode, m.ulp;

      INSERT INTO public.master_audit
        (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
      VALUES ('gardu', m.gardu_kode, m.ulp, k, NULL, to_jsonb(v),
              'lengkapi_lapangan', auth.uid(), p_nama);

      kolom := k; tindakan := 'dilengkapi'; sebelum := NULL; sesudah := v;
      RETURN NEXT;

    ELSIF lama IS DISTINCT FROM v THEN
      -- Satu usulan menunggu per field, bukan satu tiap kali tombol ditekan.
      -- Tanpa penjaga ini, mencoba tiga kali meninggalkan tiga usulan kembar di
      -- meja admin — persis yang terjadi pada koreksi titik gardu di modul JTR.
      SELECT u.id INTO ada FROM public.master_usulan u
      WHERE u.entitas = 'gardu' AND upper(u.entitas_kode) = upper(m.gardu_kode)
        AND upper(u.ulp) = upper(m.ulp) AND u.field = k AND u.status = 'menunggu'
      LIMIT 1;

      IF ada IS NOT NULL THEN
        UPDATE public.master_usulan
        SET nilai_baru = jsonb_build_object('nilai', v),
            bukti_foto = COALESCE(foto, '{}'),
            sumber_id = p_pemeliharaan_id,
            pengusul_nama = COALESCE(p_nama, pengusul_nama),
            diusulkan_at = now()
        WHERE id = ada;
      ELSE
        INSERT INTO public.master_usulan
          (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, bukti_foto,
           sumber_modul, sumber_id, pengusul_uid, pengusul_nama,
           diterapkan_langsung, catatan)
        VALUES ('gardu', m.gardu_kode, m.ulp, k,
                jsonb_build_object('nilai', lama), jsonb_build_object('nilai', v),
                COALESCE(foto, '{}'), 'pemeliharaan_gardu', p_pemeliharaan_id,
                auth.uid(), p_nama, false,
                'Terbaca di nama plat saat pemeliharaan gardu');
      END IF;

      kolom := k; tindakan := 'diusulkan'; sebelum := lama; sesudah := v;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;

-- ── 3. Tandai pekerjaan selesai ────────────────────────────────
-- Menolak yang belum lengkap, dan MENYEBUT APA YANG KURANG. Penolakan yang cuma
-- berbunyi "belum lengkap" memaksa petugas menebak sambil berdiri di gardu, dan
-- yang menebak akan mengisi asal supaya tombolnya mau ditekan.

CREATE OR REPLACE FUNCTION public.selesaikan_pemeliharaan(
  p_id   UUID,
  p_nama TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m       RECORD;
  kurang  TEXT[] := '{}';
  s       TEXT;
BEGIN
  SELECT * INTO m FROM public.pemeliharaan_gardu WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pemeliharaan tidak ditemukan'; END IF;

  -- Item wajib yang belum terisi, per fasa kalau memang dinilai per fasa.
  FOR s IN
    -- Item per FASA harus lengkap R/S/T: ketiganya selalu ada di gardu mana pun.
    --
    -- Item per JURUSAN cukup SATU terisi. Gardu berjurusan dua tidak punya
    -- jurusan C dan D, dan memaksa regu mengisi jurusan yang tidak ada cuma
    -- melahirkan angka karangan supaya tombolnya mau ditekan.
    SELECT i.nama || CASE WHEN i.dimensi = 'fasa' THEN ' (fasa ' || b.bagian || ')' ELSE '' END
    FROM public.hargardu_item_ref i
    CROSS JOIN LATERAL (
      SELECT unnest(CASE i.dimensi
                      WHEN 'fasa' THEN ARRAY['R','S','T']
                      ELSE ARRAY['-'] END) AS bagian
    ) b
    WHERE i.aktif AND i.wajib AND i.dimensi <> 'jurusan'
      AND NOT EXISTS (
        SELECT 1 FROM public.pemeliharaan_gardu_periksa p
        WHERE p.pemeliharaan_id = p_id AND p.item_kode = i.kode AND p.bagian = b.bagian
          AND (p.nilai IS NOT NULL OR p.nilai_angka IS NOT NULL))
    ORDER BY i.urutan, b.bagian
  LOOP
    kurang := kurang || s;
  END LOOP;

  FOR s IN
    SELECT i.nama || ' (minimal satu jurusan)'
    FROM public.hargardu_item_ref i
    WHERE i.aktif AND i.wajib AND i.dimensi = 'jurusan'
      AND NOT EXISTS (
        SELECT 1 FROM public.pemeliharaan_gardu_periksa p
        WHERE p.pemeliharaan_id = p_id AND p.item_kode = i.kode
          AND (p.nilai IS NOT NULL OR p.nilai_angka IS NOT NULL))
    ORDER BY i.urutan
  LOOP
    kurang := kurang || s;
  END LOOP;

  FOR s IN
    SELECT 'Foto ' || r.nama
    FROM public.hargardu_foto_ref r
    WHERE r.aktif AND r.wajib
      AND NOT EXISTS (SELECT 1 FROM public.pemeliharaan_gardu_foto f
                      WHERE f.pemeliharaan_id = p_id AND f.slot = r.kode)
    ORDER BY r.urutan
  LOOP
    kurang := kurang || s;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.pemeliharaan_gardu_ukur
                 WHERE pemeliharaan_id = p_id AND tahap = 'sebelum') THEN
    -- Cor ke ::text WAJIB. Tanpa itu Postgres menganggap literalnya
    -- sebuah ARRAY dan menolak dengan "malformed array literal" — galat
    -- yang muncul justru saat petugas menekan Selesai di lapangan.
    kurang := kurang || 'Pengukuran sebelum pemeliharaan'::text;
  END IF;

  IF array_length(kurang, 1) > 0 THEN
    RAISE EXCEPTION 'Belum bisa diselesaikan. Yang masih kurang: %',
      array_to_string(kurang, '; ');
  END IF;

  -- Pengukuran SESUDAH sengaja tidak menghalangi. Ada pemeliharaan yang memang
  -- tidak mengubah beban, dan menolak laporan karenanya cuma melahirkan angka
  -- karangan supaya tombolnya mau ditekan.
  UPDATE public.pemeliharaan_gardu
  SET status = 'Selesai',
      tgl_selesai = COALESCE(tgl_selesai, now()),
      petugas_nama = COALESCE(p_nama, petugas_nama),
      updated_at = now()
  WHERE id = p_id;
END $$;

-- ── 4. Keputusan admin ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.putuskan_pemeliharaan(
  p_id      UUID,
  p_setuju  BOOLEAN,
  p_nama    TEXT DEFAULT NULL,
  p_catatan TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m RECORD;
BEGIN
  SELECT * INTO m FROM public.pemeliharaan_gardu WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pemeliharaan tidak ditemukan'; END IF;
  IF m.status NOT IN ('Selesai', 'Ditolak') THEN
    RAISE EXCEPTION 'Pemeliharaan % masih berstatus %. Hanya yang sudah dinyatakan selesai petugas yang bisa diputuskan.',
      m.gardu_kode, m.status;
  END IF;

  -- Penolakan WAJIB beralasan. Ditolak tanpa alasan berarti regu mengulang
  -- seluruh pekerjaan sambil menebak apa yang salah.
  IF NOT p_setuju AND (p_catatan IS NULL OR btrim(p_catatan) = '') THEN
    RAISE EXCEPTION 'Penolakan harus disertai alasan';
  END IF;

  UPDATE public.pemeliharaan_gardu
  SET status = CASE WHEN p_setuju THEN 'Diverifikasi' ELSE 'Ditolak' END,
      verified_at = now(),
      verified_by = p_nama,
      verified_note = p_catatan,
      updated_at = now()
  WHERE id = p_id;

  IF p_setuju THEN
    -- Master gardu ini akhirnya pernah dikonfirmasi orang yang berdiri di
    -- bawahnya. Inilah yang menggerakkan angka kelengkapan master.
    UPDATE public.gardu
    SET master_terverifikasi_at = now(),
        master_terverifikasi_dari = p_id,
        updated_at = now()
    WHERE upper(kode) = upper(m.gardu_kode) AND upper(ulp) = upper(m.ulp);

    -- Usulan koreksi master TIDAK ikut disetujui di sini. kVA yang berubah
    -- pantas dilihat sendiri — disetujui satu per satu di layar yang sama,
    -- bukan terbawa diam-diam oleh persetujuan pekerjaannya.

  ELSE
    -- Pekerjaannya ditolak, jadi usulan koreksi yang lahir darinya ikut gugur.
    -- Membiarkannya menggantung berarti master bisa berubah karena pekerjaan
    -- yang sudah dinyatakan tidak sah.
    UPDATE public.master_usulan
    SET status = 'ditolak',
        penilai_nama = p_nama,
        dinilai_at = now(),
        alasan = 'Pekerjaan pemeliharaannya ditolak: ' || COALESCE(p_catatan, '')
    WHERE sumber_modul = 'pemeliharaan_gardu' AND sumber_id = p_id AND status = 'menunggu';
  END IF;
END $$;

-- ── 5. Jadikan Work Order ──────────────────────────────────
-- Menyimpan PENUGASANNYA saja. Temuannya tetap tinggal di catatan pemeliharaan,
-- dan daftar pekerjaan tertunda tetap diturunkan dari sana — jadi begitu
-- pemeliharaan berikutnya mencatat itemnya normal, dia hilang dari daftar
-- dengan sendirinya, tanpa ada yang perlu menutup apa pun.

-- Dibuang dulu: Postgres menolak mengganti NAMA parameter lewat CREATE OR
-- REPLACE, dan `p_fasa` berganti jadi `p_bagian` ketika item bisa dinilai
-- per jurusan, bukan cuma per fasa.
DROP FUNCTION IF EXISTS public.tandai_tindak_lanjut(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.tandai_tindak_lanjut(
  p_gardu   TEXT,
  p_ulp     TEXT,
  p_item    TEXT,
  p_bagian  TEXT DEFAULT '-',
  p_wo_item UUID DEFAULT NULL,
  p_nama    TEXT DEFAULT NULL,
  p_catatan TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.tindak_lanjut_gardu
    (gardu_kode, ulp, item_kode, bagian, wo_item_id, ditugaskan_oleh, catatan)
  VALUES (p_gardu, p_ulp, p_item, COALESCE(NULLIF(p_bagian, ''), '-'),
          p_wo_item, p_nama, p_catatan)
  ON CONFLICT (gardu_kode, ulp, item_kode, bagian) DO UPDATE
    SET wo_item_id = EXCLUDED.wo_item_id,
        ditugaskan_pada = now(),
        ditugaskan_oleh = EXCLUDED.ditugaskan_oleh,
        catatan = EXCLUDED.catatan;
END $$;

-- ── 6. Pengaturan daftar item pemeriksaan — hanya UP3 ──────────────
-- Daftar isian adalah DATA, bukan kode: menambah "Tekep Bushing" harus cukup
-- satu baris, bukan rilis aplikasi baru yang ditunggu semua HP.
--
-- Penulisannya lewat fungsi, bukan langsung ke tabel, karena dua hal yang
-- tidak boleh terpisah dari perubahannya: JEJAK AUDIT dan PENJAGA. Kalau
-- layar boleh menulis sendiri ke `hargardu_item_ref`, jejaknya tinggal soal
-- ada-tidaknya kode yang mengingat — dan yang lupa dicatat tidak pernah
-- ketahuan, karena tidak ada galat apa pun saat sesuatu TIDAK ditulis.

CREATE OR REPLACE FUNCTION public.hargardu_wajib_up3()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'UP3'
  ) THEN
    RAISE EXCEPTION
      'Hanya UP3 yang boleh mengubah daftar item pemeriksaan. Daftarnya SATU untuk semua ULP — kalau tiap unit mengarang kosakatanya sendiri, angka se-UP3 tidak bisa dijumlahkan lagi.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.simpan_item_hargardu(
  p_kode             TEXT,
  p_nama             TEXT,
  p_kelompok         TEXT,
  p_dimensi          TEXT,
  p_tipe             TEXT,
  p_satuan           TEXT    DEFAULT NULL,
  p_wajib            BOOLEAN DEFAULT true,
  p_urutan           INT     DEFAULT 100,
  p_aktif            BOOLEAN DEFAULT true,
  p_tampil_dashboard BOOLEAN DEFAULT false,
  p_keterangan       TEXT    DEFAULT NULL,
  p_oleh             TEXT    DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lama    public.hargardu_item_ref%ROWTYPE;
  baru    public.hargardu_item_ref%ROWTYPE;
  v_kode  TEXT;
  dipakai INT;
BEGIN
  PERFORM public.hargardu_wajib_up3();

  v_kode := lower(btrim(COALESCE(p_kode, '')));

  -- Kode ini akan tertulis di ribuan baris pemeriksaan dan TIDAK PERNAH boleh
  -- berubah lagi. Spasi atau huruf besar yang lolos sekarang jadi pembeda
  -- senyap selamanya: 'Tekep_FCO' dan 'tekep_fco' terlihat sama di layar dan
  -- terhitung sebagai dua item yang berbeda.
  IF v_kode !~ '^[a-z][a-z0-9_]{1,40}$' THEN
    RAISE EXCEPTION
      'Kode item "%" tidak sah. Pakai huruf kecil, angka, dan garis bawah (mis. tekep_bushing) — kode ini tertulis di tiap catatan pemeriksaan dan tidak bisa diganti lagi.',
      p_kode;
  END IF;
  IF btrim(COALESCE(p_nama, '')) = '' THEN
    RAISE EXCEPTION 'Nama item tidak boleh kosong';
  END IF;
  IF btrim(COALESCE(p_kelompok, '')) = '' THEN
    RAISE EXCEPTION 'Kelompok tidak boleh kosong — kelompok inilah yang jadi langkah formulir di HP';
  END IF;

  -- Hanya item berpilihan yang punya penilaian normal/tidak normal, dan
  -- itulah bahan tiga kelompok di dashboard. Item angka yang ditandai tampil
  -- akan muncul sebagai batang yang SELURUHNYA "belum diperiksa" meski
  -- datanya lengkap — salah tanpa satu pun galat.
  IF p_tampil_dashboard AND p_tipe <> 'pilihan' THEN
    RAISE EXCEPTION
      'Item bertipe % tidak bisa ditampilkan di dashboard. Tiga kelompok dashboard dihitung dari penilaian normal/tidak normal, dan itu cuma dimiliki item berpilihan.',
      p_tipe;
  END IF;

  SELECT * INTO lama FROM public.hargardu_item_ref WHERE kode = v_kode;

  IF lama.kode IS NOT NULL THEN
    SELECT count(*) INTO dipakai
    FROM public.pemeliharaan_gardu_periksa WHERE item_kode = v_kode;

    -- `tipe` dan `dimensi` menentukan BENTUK jawaban yang sudah tersimpan.
    -- Mengubahnya setelah dipakai membuat jawaban lama tidak cocok dengan
    -- apa pun saat direkap: 'R' pada item yang kini per-jurusan tidak pernah
    -- ketemu, dan angkanya cuma terlihat mengecil.
    IF dipakai > 0 AND (lama.dimensi <> p_dimensi OR lama.tipe <> p_tipe) THEN
      RAISE EXCEPTION
        'Item "%" sudah dipakai % catatan pemeriksaan, jadi tipe dan dimensinya tidak bisa diubah lagi. Nonaktifkan item ini dan buat item baru kalau bentuk isiannya memang berubah.',
        lama.nama, dipakai;
    END IF;

    -- Tidak ada yang berubah → tidak ada yang perlu dicatat. Tanpa ini, tiap
    -- kali kursor meninggalkan kolom, riwayat perubahan bertambah satu baris
    -- kosong dan yang sungguhan tenggelam di antaranya.
    IF lama.nama = p_nama
       AND lama.kelompok = p_kelompok
       AND lama.dimensi = p_dimensi
       AND lama.tipe = p_tipe
       AND lama.satuan IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(p_satuan, '')), '')
       AND lama.wajib = p_wajib
       AND lama.urutan = p_urutan
       AND lama.aktif = p_aktif
       AND lama.tampil_dashboard = p_tampil_dashboard
       AND lama.keterangan IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(p_keterangan, '')), '')
    THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.hargardu_item_ref
    (kode, nama, kelompok, dimensi, tipe, satuan, wajib, urutan, aktif,
     tampil_dashboard, keterangan)
  VALUES
    (v_kode, btrim(p_nama), btrim(p_kelompok), p_dimensi, p_tipe,
     NULLIF(btrim(COALESCE(p_satuan, '')), ''), p_wajib, p_urutan, p_aktif,
     p_tampil_dashboard, NULLIF(btrim(COALESCE(p_keterangan, '')), ''))
  ON CONFLICT (kode) DO UPDATE SET
    nama             = EXCLUDED.nama,
    kelompok         = EXCLUDED.kelompok,
    dimensi          = EXCLUDED.dimensi,
    tipe             = EXCLUDED.tipe,
    satuan           = EXCLUDED.satuan,
    wajib            = EXCLUDED.wajib,
    urutan           = EXCLUDED.urutan,
    aktif            = EXCLUDED.aktif,
    tampil_dashboard = EXCLUDED.tampil_dashboard,
    keterangan       = EXCLUDED.keterangan,
    updated_at       = now()
  RETURNING * INTO baru;

  INSERT INTO public.hargardu_ref_audit
    (tabel, kunci, aksi, nilai_lama, nilai_baru, oleh_uid, oleh_nama)
  VALUES (
    'item', v_kode,
    CASE
      WHEN lama.kode IS NULL          THEN 'tambah'
      WHEN lama.aktif AND NOT p_aktif THEN 'nonaktif'
      ELSE 'ubah'
    END,
    CASE WHEN lama.kode IS NULL THEN NULL ELSE to_jsonb(lama) END,
    to_jsonb(baru), auth.uid(), p_oleh);
END $$;

-- Menghapus item yang sudah dipakai ditolak penjaga `trg_jaga_item_terpakai`
-- di skema — bukan di sini. Aturannya milik data, bukan milik jalur tulis yang
-- kebetulan lewat: lewat mana pun perintahnya datang, jawabannya sama.
CREATE OR REPLACE FUNCTION public.hapus_item_hargardu(
  p_kode TEXT,
  p_oleh TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lama public.hargardu_item_ref%ROWTYPE;
BEGIN
  PERFORM public.hargardu_wajib_up3();

  SELECT * INTO lama FROM public.hargardu_item_ref WHERE kode = p_kode;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item % tidak ada', p_kode; END IF;

  -- Pilihan jawabannya ikut terhapus lewat CASCADE, dan itu aman: pilihan
  -- hanya bisa terpakai kalau itemnya terpakai, sedangkan item yang terpakai
  -- sudah ditolak penjaga di baris berikutnya.
  DELETE FROM public.hargardu_item_ref WHERE kode = p_kode;

  INSERT INTO public.hargardu_ref_audit
    (tabel, kunci, aksi, nilai_lama, nilai_baru, oleh_uid, oleh_nama)
  VALUES ('item', p_kode, 'hapus', to_jsonb(lama), NULL, auth.uid(), p_oleh);
END $$;

CREATE OR REPLACE FUNCTION public.simpan_opsi_hargardu(
  p_item   TEXT,
  p_kode   TEXT,
  p_label  TEXT,
  p_normal BOOLEAN,
  p_urutan INT     DEFAULT 100,
  p_aktif  BOOLEAN DEFAULT true,
  p_oleh   TEXT    DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it     public.hargardu_item_ref%ROWTYPE;
  lama   public.hargardu_opsi_ref%ROWTYPE;
  baru   public.hargardu_opsi_ref%ROWTYPE;
  v_kode TEXT;
BEGIN
  PERFORM public.hargardu_wajib_up3();

  SELECT * INTO it FROM public.hargardu_item_ref WHERE kode = p_item;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item % tidak ada', p_item; END IF;
  IF it.tipe <> 'pilihan' THEN
    RAISE EXCEPTION 'Item "%" bertipe % — isiannya diketik regu, bukan dipilih dari daftar.',
      it.nama, it.tipe;
  END IF;

  v_kode := lower(btrim(COALESCE(p_kode, '')));
  IF v_kode !~ '^[a-z][a-z0-9_]{1,40}$' THEN
    RAISE EXCEPTION
      'Kode pilihan "%" tidak sah. Pakai huruf kecil, angka, dan garis bawah (mis. rembes) — labelnya boleh diganti kapan saja, kodenya tidak.',
      p_kode;
  END IF;
  IF btrim(COALESCE(p_label, '')) = '' THEN
    RAISE EXCEPTION 'Label pilihan tidak boleh kosong';
  END IF;

  SELECT * INTO lama FROM public.hargardu_opsi_ref
  WHERE item_kode = p_item AND kode = v_kode;

  IF lama.kode IS NOT NULL
     AND lama.label = btrim(p_label)
     AND lama.normal = p_normal
     AND lama.urutan = p_urutan
     AND lama.aktif = p_aktif
  THEN
    RETURN;
  END IF;

  INSERT INTO public.hargardu_opsi_ref (item_kode, kode, label, normal, urutan, aktif)
  VALUES (p_item, v_kode, btrim(p_label), p_normal, p_urutan, p_aktif)
  ON CONFLICT (item_kode, kode) DO UPDATE SET
    label  = EXCLUDED.label,
    normal = EXCLUDED.normal,
    urutan = EXCLUDED.urutan,
    aktif  = EXCLUDED.aktif
  RETURNING * INTO baru;

  -- Mengubah `normal` mengubah angka yang SUDAH ADA, bukan cuma yang berikutnya:
  -- seluruh rekap diturunkan dari kolom ini. Itu memang disengaja — penilaiannya
  -- data, bukan kode — tapi justru karena itu perubahannya harus tercatat siapa
  -- dan kapan, supaya angka yang tiba-tiba melompat masih bisa dijelaskan.
  INSERT INTO public.hargardu_ref_audit
    (tabel, kunci, aksi, nilai_lama, nilai_baru, oleh_uid, oleh_nama)
  VALUES (
    'opsi', p_item || '/' || v_kode,
    CASE
      WHEN lama.kode IS NULL          THEN 'tambah'
      WHEN lama.aktif AND NOT p_aktif THEN 'nonaktif'
      ELSE 'ubah'
    END,
    CASE WHEN lama.kode IS NULL THEN NULL ELSE to_jsonb(lama) END,
    to_jsonb(baru), auth.uid(), p_oleh);
END $$;

CREATE OR REPLACE FUNCTION public.hapus_opsi_hargardu(
  p_item TEXT,
  p_kode TEXT,
  p_oleh TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lama public.hargardu_opsi_ref%ROWTYPE;
BEGIN
  PERFORM public.hargardu_wajib_up3();

  SELECT * INTO lama FROM public.hargardu_opsi_ref
  WHERE item_kode = p_item AND kode = p_kode;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pilihan %/% tidak ada', p_item, p_kode; END IF;

  -- Yang sudah dipakai ditolak `trg_jaga_opsi_terpakai`: menghapusnya membuat
  -- laporan lama menunjuk pilihan yang tidak ada lagi.
  DELETE FROM public.hargardu_opsi_ref WHERE item_kode = p_item AND kode = p_kode;

  INSERT INTO public.hargardu_ref_audit
    (tabel, kunci, aksi, nilai_lama, nilai_baru, oleh_uid, oleh_nama)
  VALUES ('opsi', p_item || '/' || p_kode, 'hapus', to_jsonb(lama), NULL,
          auth.uid(), p_oleh);
END $$;

-- ── 7. Hak akses ─────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.simpan_periksa_pemeliharaan TO authenticated;
GRANT EXECUTE ON FUNCTION public.usulkan_spek_gardu           TO authenticated;
GRANT EXECUTE ON FUNCTION public.selesaikan_pemeliharaan      TO authenticated;
GRANT EXECUTE ON FUNCTION public.putuskan_pemeliharaan        TO authenticated;
GRANT EXECUTE ON FUNCTION public.tandai_tindak_lanjut         TO authenticated;
GRANT EXECUTE ON FUNCTION public.simpan_item_hargardu         TO authenticated;
GRANT EXECUTE ON FUNCTION public.hapus_item_hargardu          TO authenticated;
GRANT EXECUTE ON FUNCTION public.simpan_opsi_hargardu         TO authenticated;
GRANT EXECUTE ON FUNCTION public.hapus_opsi_hargardu          TO authenticated;
