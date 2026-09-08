-- =============================================================================
-- Fase 0.1 + 0.2 — Usulan koreksi master + jejak audit
-- Jalankan manual di Supabase SQL Editor. Idempoten (aman diulang).
--
-- Inti program: master diperbaiki oleh data lapangan, dan yang dianggap benar
-- adalah masukan lapangan yang diverifikasi admin.
--
-- Tabel ini melayani SEMUA pekerjaan, bukan hanya JTR. Bentuknya sengaja
-- generik — entitas + field + nilai lama + nilai baru + bukti — supaya menambah
-- jenis koreksi berikutnya (kVA, penyulang, alamat) tidak menuntut tabel baru.
--
-- ── DUA CARA SEBUAH KOREKSI MENDARAT ────────────────────────────────────────
--
--   diterapkan_langsung = true
--     Master berubah SEKARANG, statusnya 'menunggu'. Admin memverifikasi
--     belakangan; kalau ditolak, master dikembalikan ke `nilai_lama`.
--     Dipakai untuk hal yang buktinya melekat pada dirinya sendiri dan
--     akibat salahnya kecil — koordinat, misalnya: petugas berdiri di sana,
--     ketelitian GPS ikut tercatat, dan salah titik tidak memicu tindakan apa
--     pun. Menahan koreksi seperti ini justru menghambat pekerjaan, karena
--     seluruh jaringan digambar dari titik itu.
--
--   diterapkan_langsung = false
--     Master TIDAK berubah sampai disetujui. Dipakai untuk nilai yang memicu
--     tindakan atau uang — kVA trafo, daya, penyulang. Salah di situ menggerakkan
--     orang dan barang, jadi lebih baik menunggu.
--
-- Perbedaannya satu kolom, dan itu disengaja: aturannya bisa digeser per field
-- tanpa mengubah bentuk tabel.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.master_usulan (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Apa yang diusulkan berubah ──
  entitas        TEXT NOT NULL,          -- 'gardu' | 'tiang' | …
  entitas_kode   TEXT NOT NULL,          -- kode gardu / kode tiang
  ulp            TEXT NOT NULL,          -- kode tidak unik lintas ULP
  field          TEXT NOT NULL,          -- 'koordinat' | 'daya' | 'penyulang' | …

  -- JSONB, bukan teks: koordinat butuh dua angka, dan field berikutnya belum
  -- tentu satu nilai tunggal. Bentuk {"lat":…, "lng":…} atau {"nilai":…}.
  nilai_lama     JSONB,
  nilai_baru     JSONB NOT NULL,

  -- ── Bukti ──
  -- Admin memutuskan dengan melihat, bukan menebak.
  bukti_lat      DOUBLE PRECISION,
  bukti_lng      DOUBLE PRECISION,
  bukti_akurasi  NUMERIC(6,1),           -- meter, apa adanya dari perangkat
  bukti_selisih  NUMERIC(10,1),          -- meter dari nilai lama, untuk koordinat
  bukti_foto     TEXT[] NOT NULL DEFAULT '{}',
  catatan        TEXT,

  -- ── Dari pekerjaan mana usulan ini lahir ──
  -- Usulan tidak pernah diketik di formulir tersendiri; dia selalu turunan dari
  -- pekerjaan yang sedang dilakukan.
  sumber_modul   TEXT,                   -- 'inspeksi_jtr' | 'pengukuran' | …
  sumber_id      UUID,

  -- ── Siapa & kapan ──
  pengusul_uid   UUID,
  pengusul_nama  TEXT,
  diusulkan_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  diterapkan_langsung BOOLEAN NOT NULL DEFAULT false,
  diterapkan_at       TIMESTAMPTZ,

  -- menunggu → disetujui | ditolak
  status         TEXT NOT NULL DEFAULT 'menunggu',
  penilai_uid    UUID,
  penilai_nama   TEXT,
  dinilai_at     TIMESTAMPTZ,
  alasan         TEXT
);

ALTER TABLE public.master_usulan DROP CONSTRAINT IF EXISTS master_usulan_status_valid;
ALTER TABLE public.master_usulan ADD CONSTRAINT master_usulan_status_valid
  CHECK (status IN ('menunggu', 'disetujui', 'ditolak'));

CREATE INDEX IF NOT EXISTS master_usulan_menunggu_idx
  ON public.master_usulan (ulp, entitas, diusulkan_at DESC) WHERE status = 'menunggu';
CREATE INDEX IF NOT EXISTS master_usulan_entitas_idx
  ON public.master_usulan (entitas, entitas_kode, ulp);

COMMENT ON TABLE public.master_usulan IS
  'Usulan koreksi data master dari lapangan. Melayani semua modul; menambah jenis koreksi tidak perlu tabel baru.';
COMMENT ON COLUMN public.master_usulan.diterapkan_langsung IS
  'true = master sudah berubah, admin memverifikasi belakangan dan bisa mengembalikan. false = master menunggu persetujuan.';

-- ── Jejak audit ──────────────────────────────────────────────────────────────
-- Semua perubahan master, termasuk yang disunting admin langsung tanpa usulan.
-- Tidak pernah dihapus dan tidak pernah disunting: begitu jejak boleh diubah,
-- dia berhenti jadi jejak.

CREATE TABLE IF NOT EXISTS public.master_audit (
  id           BIGSERIAL PRIMARY KEY,
  entitas      TEXT NOT NULL,
  entitas_kode TEXT NOT NULL,
  ulp          TEXT NOT NULL,
  field        TEXT NOT NULL,
  nilai_lama   JSONB,
  nilai_baru   JSONB,
  aksi         TEXT NOT NULL,   -- 'koreksi_lapangan' | 'disetujui' | 'ditolak_dikembalikan' | 'sunting_admin'
  usulan_id    UUID REFERENCES public.master_usulan(id) ON DELETE SET NULL,
  oleh_uid     UUID,
  oleh_nama    TEXT,
  pada         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS master_audit_entitas_idx
  ON public.master_audit (entitas, entitas_kode, ulp, pada DESC);

COMMENT ON TABLE public.master_audit IS
  'Riwayat perubahan master. Hanya bertambah — tidak pernah dihapus atau disunting.';

-- ── Koreksi koordinat gardu dari lapangan ────────────────────────────────────
-- Satu fungsi, dijalankan sebagai satu transaksi: master berubah, usulan
-- tercatat, jejak audit tertulis. Kalau dikerjakan terpisah dari aplikasi,
-- salah satunya bisa gagal dan meninggalkan keadaan setengah jadi — master
-- berubah tanpa jejak, atau jejak tanpa perubahan.
--
-- SECURITY DEFINER supaya nanti bisa dikunci lewat GRANT EXECUTE, bukan lewat
-- membuka lebar-lebar hak UPDATE tabel `gardu`.

CREATE OR REPLACE FUNCTION public.koreksi_titik_gardu(
  p_kode      TEXT,
  p_ulp       TEXT,
  p_lat       DOUBLE PRECISION,
  p_lng       DOUBLE PRECISION,
  p_akurasi   NUMERIC DEFAULT NULL,
  p_nama      TEXT DEFAULT NULL,
  p_catatan   TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g          RECORD;
  lama       JSONB;
  selisih    NUMERIC;
  id_usulan  UUID;
  langsung   BOOLEAN;
BEGIN
  SELECT kode, ulp, lat, lng INTO g
  FROM public.gardu
  WHERE upper(kode) = upper(p_kode) AND upper(ulp) = upper(p_ulp);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gardu % di ULP % tidak ada di master', p_kode, p_ulp;
  END IF;

  IF g.lat IS NULL OR g.lng IS NULL THEN
    -- Mengisi yang kosong: melengkapi, bukan mengoreksi. Tetap dicatat supaya
    -- ketahuan siapa yang mengisi, tapi tidak perlu ditinjau ulang.
    lama := NULL;
    selisih := NULL;
    langsung := true;
  ELSE
    lama := jsonb_build_object('lat', g.lat, 'lng', g.lng);
    selisih := round(public.jarak_meter(g.lat::double precision, g.lng::double precision, p_lat, p_lng)::numeric, 1);
    langsung := true;
  END IF;

  UPDATE public.gardu
  SET lat = p_lat, lng = p_lng
  WHERE upper(kode) = upper(p_kode) AND upper(ulp) = upper(p_ulp);

  INSERT INTO public.master_usulan (
    entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru,
    bukti_lat, bukti_lng, bukti_akurasi, bukti_selisih, catatan,
    sumber_modul, pengusul_uid, pengusul_nama,
    diterapkan_langsung, diterapkan_at,
    status
  ) VALUES (
    'gardu', upper(p_kode), upper(p_ulp), 'koordinat',
    lama, jsonb_build_object('lat', p_lat, 'lng', p_lng),
    p_lat, p_lng, p_akurasi, selisih, p_catatan,
    'inspeksi_jtr', auth.uid(), p_nama,
    langsung, now(),
    -- Mengisi yang kosong tidak perlu antre verifikasi; mengubah yang sudah ada
    -- selalu perlu dilihat orang.
    CASE WHEN lama IS NULL THEN 'disetujui' ELSE 'menunggu' END
  )
  RETURNING id INTO id_usulan;

  INSERT INTO public.master_audit (
    entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru,
    aksi, usulan_id, oleh_uid, oleh_nama
  ) VALUES (
    'gardu', upper(p_kode), upper(p_ulp), 'koordinat',
    lama, jsonb_build_object('lat', p_lat, 'lng', p_lng),
    CASE WHEN lama IS NULL THEN 'isi_kosong' ELSE 'koreksi_lapangan' END,
    id_usulan, auth.uid(), p_nama
  );

  RETURN id_usulan;
END $$;

-- ── Keputusan admin ──────────────────────────────────────────────────────────
-- Menolak koreksi koordinat MENGEMBALIKAN master ke nilai lama. Inilah yang
-- membuat "terapkan dulu, verifikasi belakangan" tetap aman: keputusan admin
-- benar-benar berarti sesuatu, bukan sekadar mencentang yang sudah terlanjur.

-- Terapkan satu field master gardu, apa pun namanya.
--
-- Dipakai `putuskan_usulan` supaya menyetujui usulan benar-benar mengubah
-- master. Sebelumnya fungsi itu hanya tahu cara menerapkan `koordinat`: usulan
-- kVA atau nomor seri akan tercatat "disetujui" tapi masternya tidak bergerak
-- sedikit pun — persetujuan yang tidak melakukan apa-apa, dan tidak ada yang
-- tahu karena statusnya tetap berbunyi berhasil.
--
-- Ditulis dinamis DENGAN DUA PENJAGA. `DIBOLEHKAN` membatasi kolom mana yang
-- boleh disentuh, dan `%I` mengutip namanya — tanpa keduanya, satu nilai `field`
-- yang jahat di tabel usulan bisa menulis ke kolom mana pun.
--
-- Dinamis, bukan daftar IF panjang, karena kolom master gardu masih akan
-- bertambah. Daftar IF yang lupa ditambahi akan gagal DIAM-DIAM.

CREATE OR REPLACE FUNCTION public.terapkan_field_gardu(
  p_kode  TEXT,
  p_ulp   TEXT,
  p_field TEXT,
  p_nilai TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  DIBOLEHKAN CONSTANT TEXT[] := ARRAY[
    'daya', 'merk', 'nama', 'alamat', 'feeder', 'no_seri', 'tahun_pembuatan',
    'jenis_gardu', 'phase', 'tegangan_primer', 'tegangan_sekunder',
    'arus_primer', 'arus_sekunder', 'vector',
    'jenis_minyak', 'volume_minyak', 'berat_total', 'tapping', 'pendingin'];
  tipe TEXT;
BEGIN
  IF NOT (p_field = ANY (DIBOLEHKAN)) THEN
    RAISE EXCEPTION 'Field % tidak boleh diubah lewat usulan koreksi', p_field;
  END IF;

  SELECT data_type INTO tipe FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'gardu' AND column_name = p_field;

  -- Kolomnya belum ada — terjadi kalau `hargardu-schema.sql` belum dijalankan.
  -- Dibiarkan gagal pelan supaya keputusan admin tidak ikut batal, tapi hasilnya
  -- false sehingga pemanggil tahu masternya tidak berubah.
  IF tipe IS NULL THEN RETURN false; END IF;

  EXECUTE format(
    'UPDATE public.gardu SET %I = $1::%s, updated_at = now()
      WHERE upper(kode) = upper($2) AND upper(ulp) = upper($3)', p_field, tipe)
    USING NULLIF(btrim(COALESCE(p_nilai, '')), ''), p_kode, p_ulp;

  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.putuskan_usulan(
  p_id      UUID,
  p_setuju  BOOLEAN,
  p_nama    TEXT DEFAULT NULL,
  p_alasan  TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u RECORD;
BEGIN
  SELECT * INTO u FROM public.master_usulan WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usulan tidak ada'; END IF;
  IF u.status <> 'menunggu' THEN
    RAISE EXCEPTION 'Usulan ini sudah diputuskan (%)', u.status;
  END IF;

  IF p_setuju THEN
    -- Belum diterapkan? Terapkan sekarang. Sudah diterapkan? Tinggal disahkan.
    IF NOT u.diterapkan_langsung AND u.entitas = 'gardu' THEN
      IF u.field = 'koordinat' THEN
        UPDATE public.gardu
        SET lat = (u.nilai_baru->>'lat')::numeric, lng = (u.nilai_baru->>'lng')::numeric
        WHERE upper(kode) = upper(u.entitas_kode) AND upper(ulp) = upper(u.ulp);
      ELSE
        PERFORM public.terapkan_field_gardu(
          u.entitas_kode, u.ulp, u.field, u.nilai_baru->>'nilai');
      END IF;
    END IF;
  ELSE
    -- Ditolak: kembalikan kalau tadi sudah terlanjur diterapkan.
    IF u.diterapkan_langsung AND u.entitas = 'gardu' AND u.nilai_lama IS NOT NULL THEN
      IF u.field = 'koordinat' THEN
        UPDATE public.gardu
        SET lat = (u.nilai_lama->>'lat')::numeric, lng = (u.nilai_lama->>'lng')::numeric
        WHERE upper(kode) = upper(u.entitas_kode) AND upper(ulp) = upper(u.ulp);
      ELSE
        PERFORM public.terapkan_field_gardu(
          u.entitas_kode, u.ulp, u.field, u.nilai_lama->>'nilai');
      END IF;
    END IF;
  END IF;

  UPDATE public.master_usulan
  SET status = CASE WHEN p_setuju THEN 'disetujui' ELSE 'ditolak' END,
      penilai_uid = auth.uid(), penilai_nama = p_nama,
      dinilai_at = now(), alasan = p_alasan
  WHERE id = p_id;

  INSERT INTO public.master_audit (
    entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru,
    aksi, usulan_id, oleh_uid, oleh_nama
  ) VALUES (
    u.entitas, u.entitas_kode, u.ulp, u.field,
    CASE WHEN p_setuju THEN u.nilai_lama ELSE u.nilai_baru END,
    CASE WHEN p_setuju THEN u.nilai_baru ELSE u.nilai_lama END,
    CASE WHEN p_setuju THEN 'disetujui' ELSE 'ditolak_dikembalikan' END,
    p_id, auth.uid(), p_nama
  );
END $$;

-- ── Daftar untuk admin ───────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.master_usulan_menunggu AS
SELECT
  u.id, u.entitas, u.entitas_kode, u.ulp, u.field,
  u.nilai_lama, u.nilai_baru,
  u.bukti_akurasi, u.bukti_selisih, u.bukti_foto, u.catatan,
  u.pengusul_nama, u.diusulkan_at, u.diterapkan_langsung,
  g.nama AS gardu_nama, g.alamat AS gardu_alamat, g.feeder AS penyulang
FROM public.master_usulan u
LEFT JOIN public.gardu g
  ON u.entitas = 'gardu'
 AND upper(g.kode) = upper(u.entitas_kode)
 AND upper(g.ulp) = upper(u.ulp)
WHERE u.status = 'menunggu'
ORDER BY u.diusulkan_at DESC;

-- ── Hak akses ────────────────────────────────────────────────────────────────
ALTER TABLE public.master_usulan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_audit  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_usulan_baca  ON public.master_usulan;
DROP POLICY IF EXISTS master_usulan_tulis ON public.master_usulan;
DROP POLICY IF EXISTS master_audit_baca   ON public.master_audit;

CREATE POLICY master_usulan_baca  ON public.master_usulan
  FOR SELECT TO authenticated USING (true);
CREATE POLICY master_usulan_tulis ON public.master_usulan
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Audit boleh dibaca, TIDAK boleh ditulis langsung. Satu-satunya jalan menulis
-- adalah lewat fungsi di atas, yang berjalan sebagai pemilik.
CREATE POLICY master_audit_baca ON public.master_audit
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.master_usulan_menunggu TO authenticated;
GRANT EXECUTE ON FUNCTION public.koreksi_titik_gardu TO authenticated;
GRANT EXECUTE ON FUNCTION public.terapkan_field_gardu TO authenticated;
GRANT EXECUTE ON FUNCTION public.putuskan_usulan     TO authenticated;

-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Usulan yang menunggu:
--      SELECT entitas_kode, ulp, field, bukti_selisih, pengusul_nama, diusulkan_at
--      FROM master_usulan_menunggu;
--
-- b. Riwayat satu gardu:
--      SELECT pada, aksi, nilai_lama, nilai_baru, oleh_nama
--      FROM master_audit WHERE entitas_kode = 'AM001' ORDER BY pada DESC;
--
-- c. Menolak sebuah usulan (master kembali ke titik lama):
--      SELECT putuskan_usulan('<id>', false, 'Nama Admin', 'Titik lapangan meleset');
-- =============================================================================
