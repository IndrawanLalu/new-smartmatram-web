-- =============================================================================
-- J1 `rencana-mobile-jtm-jtr.md` (25 Sep 2026) — bagian JTM
-- Jalankan manual di Supabase SQL Editor, SESUDAH `harjar-kerja-hp.sql`.
-- Idempoten. JTR menyusul di J5 memakai tabel WO yang sama.
--
--   1. wo_inspeksi + wo_inspeksi_item — WO inspeksi pola WO Perabasan
--      (satuan segmen untuk JTM, gardu untuk JTR), ukuran km
--   2. inspeksi_jtm.wo_item_id — inspeksi tersambung ke WO-nya sendiri
--   3. terbitkan / tugaskan regu / batalkan item
--   4. tiang.id_hp — tiang baru dari HP idempoten
--   5. kirim_tiang_jtm(p_isi) — kiriman HP: tiang baru + penilaian (+ tutup),
--      SATU transaksi, memakai ulang tambah_tiang_jtm & nilai_tiang_jtm
--   6. rekap_kinerja — JTM punya WO terbit & km di luar WO
--      ⚠ kolom luar_wo berganti INT → NUMERIC (fungsi di-DROP dulu)
-- =============================================================================


-- ── 1. WO inspeksi ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wo_inspeksi (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis      TEXT NOT NULL,                       -- 'JTM' | 'JTR'
  ulp        TEXT NOT NULL,
  nama       TEXT NOT NULL,
  tgl_wo     DATE NOT NULL DEFAULT CURRENT_DATE,
  target_km  NUMERIC(8,2),
  status     TEXT NOT NULL DEFAULT 'Terbit',
  catatan    TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wo_inspeksi DROP CONSTRAINT IF EXISTS wo_inspeksi_jenis_valid;
ALTER TABLE public.wo_inspeksi ADD CONSTRAINT wo_inspeksi_jenis_valid CHECK (jenis IN ('JTM', 'JTR'));
ALTER TABLE public.wo_inspeksi DROP CONSTRAINT IF EXISTS wo_inspeksi_status_valid;
ALTER TABLE public.wo_inspeksi ADD CONSTRAINT wo_inspeksi_status_valid
  CHECK (status IN ('Terbit', 'Selesai', 'Dibatalkan'));
CREATE INDEX IF NOT EXISTS wo_inspeksi_ulp_idx ON public.wo_inspeksi (jenis, ulp, tgl_wo DESC);

-- Satu baris = satu objek yang harus diinspeksi. Identitas & panjangnya
-- POTRET saat terbit (WO adalah dokumen bertanggal — pola WO Perabasan).
-- Status item hanya Terbuka / Selesai / Dibatalkan: tahap pekerjaannya
-- (sedang diinspeksi, menunggu persetujuan, dikembalikan) DITURUNKAN dari
-- inspeksinya, bukan disalin ke sini.
CREATE TABLE IF NOT EXISTS public.wo_inspeksi_item (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id       UUID NOT NULL REFERENCES public.wo_inspeksi(id) ON DELETE CASCADE,
  jenis       TEXT NOT NULL,
  urutan      INT  NOT NULL DEFAULT 0,
  ulp         TEXT NOT NULL,
  penyulang   TEXT,
  segmen_id   UUID REFERENCES public.segmen(id) ON DELETE RESTRICT,   -- JTM
  gardu_kode  TEXT,                                                  -- JTR
  objek_nama  TEXT NOT NULL,
  panjang_km  NUMERIC(8,3),
  panjang_dari TEXT,
  regu        TEXT,
  status      TEXT NOT NULL DEFAULT 'Terbuka',
  catatan     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wo_inspeksi_item DROP CONSTRAINT IF EXISTS wo_inspeksi_item_status_valid;
ALTER TABLE public.wo_inspeksi_item ADD CONSTRAINT wo_inspeksi_item_status_valid
  CHECK (status IN ('Terbuka', 'Selesai', 'Dibatalkan'));
ALTER TABLE public.wo_inspeksi_item DROP CONSTRAINT IF EXISTS wo_inspeksi_item_objek_valid;
ALTER TABLE public.wo_inspeksi_item ADD CONSTRAINT wo_inspeksi_item_objek_valid
  CHECK ((jenis = 'JTM' AND segmen_id IS NOT NULL) OR (jenis = 'JTR' AND gardu_kode IS NOT NULL));
CREATE INDEX IF NOT EXISTS wo_inspeksi_item_wo_idx ON public.wo_inspeksi_item (wo_id, urutan);
-- Satu objek satu WO terbuka.
CREATE UNIQUE INDEX IF NOT EXISTS wo_inspeksi_item_segmen_terbuka
  ON public.wo_inspeksi_item (segmen_id) WHERE status = 'Terbuka' AND segmen_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wo_inspeksi_item_gardu_terbuka
  ON public.wo_inspeksi_item (gardu_kode, ulp) WHERE status = 'Terbuka' AND gardu_kode IS NOT NULL;

COMMENT ON TABLE public.wo_inspeksi_item IS
  'Satu segmen (JTM) / gardu (JTR) dalam WO inspeksi. WO hanya TARGET: inspeksi di luar WO tetap boleh (keputusan e).';

ALTER TABLE public.wo_inspeksi      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_inspeksi_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wo_inspeksi_baca      ON public.wo_inspeksi;
DROP POLICY IF EXISTS wo_inspeksi_item_baca ON public.wo_inspeksi_item;
CREATE POLICY wo_inspeksi_baca      ON public.wo_inspeksi      FOR SELECT TO authenticated USING (true);
CREATE POLICY wo_inspeksi_item_baca ON public.wo_inspeksi_item FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.wo_inspeksi, public.wo_inspeksi_item TO authenticated;
-- Penulisan HANYA lewat fungsi di bawah.


-- ── 2. Inspeksi tersambung ke WO ─────────────────────────────────────────────
ALTER TABLE public.inspeksi_jtm
  ADD COLUMN IF NOT EXISTS wo_item_id UUID REFERENCES public.wo_inspeksi_item(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS inspeksi_jtm_wo_item_idx ON public.inspeksi_jtm (wo_item_id);

-- Inspeksi yang lahir di segmen ber-WO terbuka otomatis tersambung — dari
-- versi HP mana pun, lewat fungsi mana pun (mulai, rintis, kirim).
CREATE OR REPLACE FUNCTION public.jtm_sambung_wo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.wo_item_id IS NULL THEN
    SELECT i.id INTO NEW.wo_item_id FROM public.wo_inspeksi_item i
    WHERE i.segmen_id = NEW.segmen_id AND i.status = 'Terbuka'
    LIMIT 1;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_jtm_sambung_wo ON public.inspeksi_jtm;
CREATE TRIGGER trg_jtm_sambung_wo BEFORE INSERT ON public.inspeksi_jtm
  FOR EACH ROW EXECUTE FUNCTION public.jtm_sambung_wo();

-- Item WO ditutup saat inspeksinya DISETUJUI admin — bukan saat dikirim:
-- yang masih bisa dikembalikan belum boleh mengurangi target.
CREATE OR REPLACE FUNCTION public.jtm_tutup_item_wo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.wo_item_id IS NOT NULL AND NEW.status = 'Diverifikasi'
     AND OLD.status IS DISTINCT FROM 'Diverifikasi' THEN
    UPDATE public.wo_inspeksi_item SET status = 'Selesai', updated_at = now()
    WHERE id = NEW.wo_item_id AND status = 'Terbuka';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_jtm_tutup_item_wo ON public.inspeksi_jtm;
CREATE TRIGGER trg_jtm_tutup_item_wo AFTER UPDATE OF status ON public.inspeksi_jtm
  FOR EACH ROW EXECUTE FUNCTION public.jtm_tutup_item_wo();


-- ── 3. Terbitkan, tugaskan, batalkan ─────────────────────────────────────────
CREATE OR REPLACE VIEW public.regu_inspeksi AS
SELECT p.nama AS regu, upper(p.ulp) AS ulp, p.group_name
FROM public.petugas p
WHERE upper(COALESCE(p.group_name, '')) IN ('INSPEKTOR', 'INSPEKSI_JTM', 'INSPEKSI_JTR')
  AND lower(COALESCE(p.status, 'aktif')) = 'aktif';
GRANT SELECT ON public.regu_inspeksi TO authenticated;

-- p_regu: {"<segmen_id>": "<nama regu>"} — boleh kosong (dikerjakan siapa saja se-ULP).
CREATE OR REPLACE FUNCTION public.terbitkan_wo_inspeksi_jtm(
  p_ulp       TEXT,
  p_nama      TEXT,
  p_target_km NUMERIC,
  p_segmen    UUID[],
  p_tgl_wo    DATE  DEFAULT CURRENT_DATE,
  p_regu      JSONB DEFAULT '{}'::jsonb,
  p_oleh      TEXT  DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  unit     TEXT := upper(btrim(COALESCE(p_ulp, '')));
  judul    TEXT := btrim(COALESCE(p_nama, ''));
  wo       UUID;
  s        RECORD;
  item     UUID;
  n        INT := 0;
  dilewati JSONB := '[]'::jsonb;
BEGIN
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih'; END IF;
  IF judul = '' THEN RAISE EXCEPTION 'Nama WO belum diisi'; END IF;
  IF COALESCE(array_length(p_segmen, 1), 0) = 0 THEN RAISE EXCEPTION 'Belum ada segmen yang dipilih'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);

  INSERT INTO public.wo_inspeksi (jenis, ulp, nama, tgl_wo, target_km, created_by)
  VALUES ('JTM', unit, judul, COALESCE(p_tgl_wo, CURRENT_DATE), p_target_km, auth.uid())
  RETURNING id INTO wo;

  FOR s IN SELECT * FROM public.master_segmen WHERE segmen_id = ANY(p_segmen) ORDER BY penyulang, nama LOOP
    IF upper(s.ulp) <> unit THEN
      dilewati := dilewati || jsonb_build_object('segmen', s.nama, 'sebab', format('Milik ULP %s, bukan %s.', s.ulp, unit));
      CONTINUE;
    END IF;
    IF s.status <> 'aktif' THEN
      dilewati := dilewati || jsonb_build_object('segmen', s.nama, 'sebab', 'Segmen tidak aktif.');
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.wo_inspeksi_item x WHERE x.segmen_id = s.segmen_id AND x.status = 'Terbuka') THEN
      dilewati := dilewati || jsonb_build_object('segmen', s.nama, 'sebab', 'Masih terbuka di WO inspeksi lain.');
      CONTINUE;
    END IF;

    n := n + 1;
    INSERT INTO public.wo_inspeksi_item
      (wo_id, jenis, urutan, ulp, penyulang, segmen_id, objek_nama, panjang_km, panjang_dari, regu)
    VALUES
      (wo, 'JTM', n, s.ulp, s.penyulang, s.segmen_id, s.nama, s.panjang_pakai_km, s.panjang_dari,
       NULLIF(btrim(COALESCE(p_regu ->> s.segmen_id::text, '')), ''))
    RETURNING id INTO item;

    -- Inspeksi yang sudah berjalan di segmen ini ikut tersambung: WO datang
    -- belakangan tidak boleh membuat pekerjaan yang sedang jalan terhitung
    -- "di luar WO".
    UPDATE public.inspeksi_jtm SET wo_item_id = item, updated_at = now()
    WHERE segmen_id = s.segmen_id AND wo_item_id IS NULL
      AND status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak');
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'Tidak ada satu pun segmen yang bisa dimasukkan. %',
      COALESCE((SELECT string_agg(d ->> 'segmen' || ': ' || (d ->> 'sebab'), ' | ') FROM jsonb_array_elements(dilewati) d), '');
  END IF;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_inspeksi', judul, unit, 'terbit', NULL,
          jsonb_build_object('wo_id', wo, 'jenis', 'JTM', 'item', n, 'target_km', p_target_km),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('wo_id', wo, 'nama', judul, 'ulp', unit, 'item', n, 'dilewati', dilewati,
    'rencana_km', (SELECT round(COALESCE(sum(panjang_km), 0), 2) FROM public.wo_inspeksi_item WHERE wo_id = wo));
END $fn$;

CREATE OR REPLACE FUNCTION public.tugaskan_regu_inspeksi(p_item_id UUID, p_regu TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it RECORD;
BEGIN
  SELECT * INTO it FROM public.wo_inspeksi_item WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item WO tidak ditemukan'; END IF;
  PERFORM public.wajib_boleh_ulp(it.ulp);
  IF it.status <> 'Terbuka' THEN RAISE EXCEPTION 'Item ini sudah %.', lower(it.status); END IF;
  UPDATE public.wo_inspeksi_item SET regu = NULLIF(btrim(COALESCE(p_regu, '')), ''), updated_at = now()
  WHERE id = p_item_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.batalkan_wo_inspeksi_item(p_item_id UUID, p_alasan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it RECORD;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi.'; END IF;
  SELECT * INTO it FROM public.wo_inspeksi_item WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item WO tidak ditemukan'; END IF;
  PERFORM public.wajib_boleh_ulp(it.ulp);
  IF it.status <> 'Terbuka' THEN RAISE EXCEPTION 'Item ini sudah %.', lower(it.status); END IF;

  UPDATE public.wo_inspeksi_item SET status = 'Dibatalkan', catatan = btrim(p_alasan), updated_at = now()
  WHERE id = p_item_id;
  -- Inspeksinya TIDAK ikut dibatalkan: pekerjaannya tetap sah, hanya tidak
  -- lagi dihitung sebagai WO (jadi "di luar WO").
  UPDATE public.inspeksi_jtm SET wo_item_id = NULL, updated_at = now() WHERE wo_item_id = p_item_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_inspeksi_item', it.objek_nama, it.ulp, 'dibatalkan', to_jsonb(it.status),
          to_jsonb(p_alasan), 'sunting_admin', auth.uid(), p_oleh);
END $fn$;

GRANT EXECUTE ON FUNCTION public.terbitkan_wo_inspeksi_jtm(TEXT, TEXT, NUMERIC, UUID[], DATE, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tugaskan_regu_inspeksi(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_wo_inspeksi_item(UUID, TEXT, TEXT) TO authenticated;

-- Daftar item + tahap yang DITURUNKAN dari inspeksi terakhirnya (HP & web).
CREATE OR REPLACE VIEW public.wo_inspeksi_item_status AS
SELECT
  i.*,
  w.nama   AS wo_nama,
  w.tgl_wo,
  m.id     AS inspeksi_id,
  m.status AS inspeksi_status,
  m.petugas_nama AS inspeksi_petugas,
  m.tgl_mulai    AS inspeksi_mulai,
  m.tgl_selesai  AS inspeksi_selesai,
  m.verified_note AS inspeksi_catatan_admin
FROM public.wo_inspeksi_item i
JOIN public.wo_inspeksi w ON w.id = i.wo_id
LEFT JOIN LATERAL (
  SELECT x.* FROM public.inspeksi_jtm x
  WHERE x.wo_item_id = i.id AND x.status <> 'Dibatalkan'
  ORDER BY x.created_at DESC LIMIT 1
) m ON true
WHERE i.jenis = 'JTM';
GRANT SELECT ON public.wo_inspeksi_item_status TO authenticated;


-- ── 4. Tiang baru dari HP: idempoten ─────────────────────────────────────────
ALTER TABLE public.tiang ADD COLUMN IF NOT EXISTS id_hp UUID;
CREATE UNIQUE INDEX IF NOT EXISTS tiang_id_hp_unik ON public.tiang (id_hp) WHERE id_hp IS NOT NULL;
COMMENT ON COLUMN public.tiang.id_hp IS
  'Id lokal tiang yang dititik di HP. Kiriman ulang dengan id yang sama tidak melahirkan tiang kedua.';


-- ── 5. Kiriman HP ────────────────────────────────────────────────────────────
-- p_isi:
-- { "inspeksi_id": uuid|null, "segmen_id": uuid, "tier": "1", "nama": "...",
--   "tiang": [ { "id_lokal": uuid,              -- id draf di HP
--                "tiang_id": uuid|null,         -- tiang yang sudah ada
--                "baru": {lat,lng,akurasi,induk_id?,induk_lokal?,jenis,konstruksi,nomor_lama,cabang}|null,
--                "lat","lng","akurasi",         -- posisi petugas SAAT menilai
--                "daftar": [...]|null,          -- sama dengan nilai_tiang_jtm
--                "catatan","dinilai_at" } ],
--   "selesai": bool, "catatan_selesai": "..." }
--
-- SATU transaksi (butir 17): gagal satu tiang = tidak ada yang tersimpan, dan
-- pesannya menyebut tiang mana. Aturan menilai (jarak, akurasi, temuan
-- berfoto, sebab menutup temuan) TIDAK disalin — tambah_tiang_jtm dan
-- nilai_tiang_jtm dipanggil apa adanya.
CREATE OR REPLACE FUNCTION public.kirim_tiang_jtm(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role   TEXT;
  v_unit   TEXT;
  v_id     UUID := NULLIF(p_isi->>'inspeksi_id', '')::uuid;
  v_seg    UUID := NULLIF(p_isi->>'segmen_id', '')::uuid;
  v_tier   TEXT := COALESCE(NULLIF(p_isi->>'tier', ''), '1');
  v_nama   TEXT := NULLIF(btrim(COALESCE(p_isi->>'nama', '')), '');
  v_status TEXT;
  s_ulp    TEXT;
  peta     JSONB := '{}'::jsonb;   -- id_lokal → tiang_id
  hasil    JSONB := '[]'::jsonb;
  r        JSONB;
  b        JSONB;
  v_tiang  UUID;
  v_induk  UUID;
  v_kode   TEXT;
  d        JSONB;
  sisa     INT := 0;
  selesai  JSONB;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;

  -- ── inspeksi mana ──
  IF v_id IS NOT NULL THEN
    SELECT status, segmen_id INTO v_status, v_seg FROM public.inspeksi_jtm WHERE id = v_id;
    IF NOT FOUND THEN v_seg := NULLIF(p_isi->>'segmen_id', '')::uuid; END IF;
    -- Dibatalkan admin (atau hilang): pekerjaan di HP tetap sah — dikirim ke
    -- inspeksi yang berjalan / yang baru di segmen yang sama.
    IF NOT FOUND OR v_status = 'Dibatalkan' THEN v_id := NULL; v_status := NULL; END IF;
  END IF;
  IF v_seg IS NULL THEN RAISE EXCEPTION 'Segmen tidak disebut — perbarui aplikasi lalu kirim ulang.'; END IF;
  SELECT ulp INTO s_ulp FROM public.segmen WHERE id = v_seg;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(COALESCE(s_ulp, '')) THEN
    RAISE EXCEPTION 'Segmen ini milik ULP %, akun ini ULP %.', COALESCE(s_ulp, '-'), COALESCE(v_unit, '-');
  END IF;

  -- Dua tim yang mengirim segmen yang sama bersamaan: yang kedua menunggu,
  -- lalu menemukan inspeksi yang dibuat yang pertama.
  PERFORM pg_advisory_xact_lock(hashtext('inspeksi-jtm|' || v_seg::text || '|' || v_tier));

  IF v_id IS NULL THEN
    -- Dimulai dari HP tanpa sinyal: cari yang sedang berjalan di segmen ini
    -- (tim lain boleh sudah memulainya — keputusan d), baru buat bila tidak ada.
    -- Yang sudah DIKIRIM (Selesai) tidak dibuka lagi dari HP (butir 2).
    SELECT id, status INTO v_id, v_status FROM public.inspeksi_jtm
    WHERE segmen_id = v_seg AND tier = v_tier AND status IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak', 'Selesai')
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_status = 'Selesai' THEN
    -- Kiriman "selesai" yang jawabannya hilang di jalan: semua tiangnya sudah
    -- ada → anggap berhasil. Selain itu tolak dengan jalan keluarnya.
    FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
      v_tiang := COALESCE(NULLIF(r->>'tiang_id', '')::uuid,
                          (SELECT id FROM public.tiang WHERE id_hp = NULLIF(r->>'id_lokal', '')::uuid));
      IF v_tiang IS NULL OR (r->'daftar' IS NOT NULL AND jsonb_typeof(r->'daftar') = 'array' AND
         NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm_titik WHERE inspeksi_id = v_id AND tiang_id = v_tiang)) THEN
        sisa := sisa + 1;
      END IF;
    END LOOP;
    IF sisa = 0 AND COALESCE((p_isi->>'selesai')::boolean, false) THEN
      RETURN jsonb_build_object('inspeksi_id', v_id, 'sudah_ada', true, 'tiang', '[]'::jsonb);
    END IF;
    RAISE EXCEPTION 'Inspeksi segmen ini sudah dikirim dan menunggu persetujuan — tiang tambahan tidak bisa dikirim. Minta admin mengembalikannya bila perlu.';
  END IF;
  IF v_status = 'Diverifikasi' THEN
    RAISE EXCEPTION 'Inspeksi segmen ini sudah disetujui admin — tidak bisa ditambah lagi.';
  END IF;

  IF v_id IS NULL OR v_status = 'Ditolak' THEN
    -- Baru, atau dikembalikan admin: dibuka lewat fungsi yang sudah ada.
    v_id := public.mulai_inspeksi_jtm(v_seg, v_tier, v_nama);
  END IF;

  -- ── tiang ──
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
    v_tiang := NULLIF(r->>'tiang_id', '')::uuid;
    b := r->'baru';

    IF v_tiang IS NULL AND b IS NOT NULL AND jsonb_typeof(b) = 'object' THEN
      SELECT id INTO v_tiang FROM public.tiang WHERE id_hp = NULLIF(r->>'id_lokal', '')::uuid;
      IF v_tiang IS NULL THEN
        v_induk := COALESCE(NULLIF(b->>'induk_id', '')::uuid,
                            NULLIF(peta->>(b->>'induk_lokal'), '')::uuid,
                            (SELECT id FROM public.tiang WHERE id_hp = NULLIF(b->>'induk_lokal', '')::uuid));
        d := public.tambah_tiang_jtm(
          v_seg,
          NULLIF(b->>'lat', '')::double precision,
          NULLIF(b->>'lng', '')::double precision,
          NULLIF(b->>'akurasi', '')::double precision,
          v_induk,
          NULLIF(b->>'jenis', ''),
          NULLIF(b->>'konstruksi', ''),
          NULLIF(b->>'nomor_lama', ''),
          v_nama,
          COALESCE((b->>'cabang')::boolean, false));
        v_tiang := (d->>'id')::uuid;
        UPDATE public.tiang SET id_hp = NULLIF(r->>'id_lokal', '')::uuid WHERE id = v_tiang;
      END IF;
    END IF;
    IF v_tiang IS NULL THEN
      RAISE EXCEPTION 'Satu tiang di kiriman ini tidak punya id — perbarui aplikasi lalu kirim ulang.';
    END IF;
    IF r->>'id_lokal' IS NOT NULL THEN peta := peta || jsonb_build_object(r->>'id_lokal', v_tiang); END IF;

    IF r->'daftar' IS NOT NULL AND jsonb_typeof(r->'daftar') = 'array' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(r->'daftar') x
        WHERE COALESCE(x->>'foto_url', '') NOT IN ('') AND x->>'foto_url' NOT LIKE 'http%'
           OR COALESCE(x->>'foto_tutup_url', '') NOT IN ('') AND x->>'foto_tutup_url' NOT LIKE 'http%'
      ) THEN
        RAISE EXCEPTION 'Foto temuan belum terunggah. Kirim ulang saat sinyal lebih baik.';
      END IF;
      PERFORM public.nilai_tiang_jtm(
        v_id, v_tiang,
        NULLIF(r->>'lat', '')::double precision,
        NULLIF(r->>'lng', '')::double precision,
        NULLIF(r->>'akurasi', '')::double precision,
        r->'daftar',
        NULLIF(btrim(COALESCE(r->>'catatan', '')), ''),
        v_nama);
      -- Waktu menilai = saat di HP (butir 17), dipotong ke sekarang bila jam HP maju.
      UPDATE public.inspeksi_jtm_titik
      SET dinilai_at = LEAST(COALESCE(NULLIF(r->>'dinilai_at', '')::timestamptz, now()), now())
      WHERE inspeksi_id = v_id AND tiang_id = v_tiang;
    END IF;

    SELECT kode INTO v_kode FROM public.tiang WHERE id = v_tiang;
    hasil := hasil || jsonb_build_object('id_lokal', r->>'id_lokal', 'tiang_id', v_tiang, 'kode', v_kode);
  END LOOP;

  -- ── tutup ──
  IF COALESCE((p_isi->>'selesai')::boolean, false) THEN
    selesai := public.selesaikan_inspeksi_jtm(v_id, v_nama, NULLIF(btrim(COALESCE(p_isi->>'catatan_selesai', '')), ''));
  END IF;

  RETURN jsonb_build_object('inspeksi_id', v_id, 'sudah_ada', false, 'tiang', hasil, 'selesai', selesai);
END $fn$;

GRANT EXECUTE ON FUNCTION public.kirim_tiang_jtm(JSONB) TO authenticated;


-- ── 6. rekap_kinerja (disalin dari versi terpasang) ─────────────────────────
-- ⚠ Kolom luar_wo berganti INT → NUMERIC (km JTM pecahan). CREATE OR REPLACE
-- tidak bisa mengubah tipe hasil, jadi di-DROP dulu. Web & HP membacanya
-- sebagai angka biasa — tidak ada yang rusak.
DROP FUNCTION IF EXISTS public.rekap_kinerja(TEXT, INT, INT);
CREATE OR REPLACE FUNCTION public.rekap_kinerja(p_ulp TEXT, p_tahun INT, p_bulan INT)
RETURNS TABLE (kunci TEXT, wo_terbit NUMERIC, realisasi NUMERIC, belum_disetujui NUMERIC, luar_wo NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  u      TEXT := NULLIF(NULLIF(upper(btrim(COALESCE(p_ulp, ''))), ''), 'SEMUA');
  d_awal DATE := make_date(p_tahun, CASE WHEN p_bulan = 0 THEN 1 ELSE p_bulan END, 1);
  d_akhr DATE;  -- eksklusif
  t_awal TIMESTAMPTZ;
  t_akhr TIMESTAMPTZ;
  jadi   NUMERIC;
BEGIN
  d_akhr := CASE WHEN p_bulan = 0 THEN make_date(p_tahun + 1, 1, 1)
                 ELSE (d_awal + INTERVAL '1 month')::date END;
  t_awal := d_awal::timestamp AT TIME ZONE 'Asia/Makassar';
  t_akhr := d_akhr::timestamp AT TIME ZONE 'Asia/Makassar';

  -- Perabasan — km dari WO Perabasan. Belum punya tahap persetujuan.
  -- `luar_wo` = pohon dirabas DI LUAR WO (tanpa segmen, tanpa km), dihitung
  -- untuk ULP REGU yang mengerjakan (keputusan user 25 Sep 2026).
  RETURN QUERY
  SELECT 'perabasan'::text, round(COALESCE(sum(c.target_km), 0), 3), round(COALESCE(sum(c.capaian_km), 0), 3), 0::numeric,
    (SELECT count(*)::numeric FROM public.perabasan_luar_wo l
      WHERE l.status IN ('Selesai', 'Diverifikasi')
        AND l.tgl >= d_awal AND l.tgl < d_akhr
        AND (u IS NULL OR upper(l.ulp_regu) = u))
  FROM public.wo_perabasan_capaian c
  WHERE c.tgl_wo::date >= d_awal AND c.tgl_wo::date < d_akhr
    AND (u IS NULL OR upper(c.ulp) = u);

  -- Pemeliharaan Jaringan — tanpa WO (keputusan user 25 Sep 2026).
  -- `luar_wo` di baris INI = berapa dari realisasi itu yang berasal dari
  -- TUGAS temuan (bukan "di luar WO") — layar menuliskannya tersendiri.
  -- Yang dikembalikan ke petugas tidak dihitung sampai dikirim ulang.
  RETURN QUERY
  SELECT 'harjtm'::text, NULL::numeric, count(*)::numeric, count(*) FILTER (WHERE j.status = 'Selesai')::numeric,
    count(*) FILTER (WHERE j.inspeksi_id IS NOT NULL)::numeric
  FROM public.pemeliharaan_jaringan j
  WHERE j.status NOT IN ('Dibatalkan', 'Dikembalikan')
    AND j.tgl::date >= d_awal AND j.tgl::date < d_akhr
    AND (u IS NULL OR upper(j.ulp) = u);

  -- Pemeliharaan Gardu — WO bulanan, realisasi SAAT DIKIRIM.
  SELECT count(*) FILTER (WHERE r.terealisasi) INTO jadi
  FROM public.wo_hargardu_realisasi r
  WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
    AND (u IS NULL OR upper(r.ulp) = u);

  RETURN QUERY
  SELECT 'hargardu'::text,
    (SELECT count(*)::numeric FROM public.wo_hargardu_realisasi r
      WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan) AND (u IS NULL OR upper(r.ulp) = u)),
    jadi,
    (SELECT count(*) FILTER (WHERE r.terealisasi AND NOT r.disetujui)::numeric FROM public.wo_hargardu_realisasi r
      WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan) AND (u IS NULL OR upper(r.ulp) = u)),
    GREATEST(0, (SELECT count(*) FROM public.pemeliharaan_gardu g
                  WHERE g.status IN ('Selesai', 'Diverifikasi')
                    AND g.created_at >= t_awal AND g.created_at < t_akhr
                    AND (u IS NULL OR upper(g.ulp) = u)) - jadi)::numeric;

  -- Penyeimbangan — tanpa WO, tanpa persetujuan.
  RETURN QUERY
  SELECT 'penyeimbangan'::text, NULL::numeric, count(*)::numeric, NULL::numeric, NULL::numeric
  FROM public.penyeimbangan_gardu p
  WHERE p.created_at >= t_awal AND p.created_at < t_akhr
    AND (u IS NULL OR upper(p.ulp) = u);

  -- Optimasi Trafo — WO = ditandai OPTIMASI TRAFO, tanpa yang dibatalkan.
  RETURN QUERY
  SELECT 'optimasi'::text,
    (SELECT count(*)::numeric FROM public.pengukuran_gardu pg
      WHERE pg.jenis_pemeliharaan = 'OPTIMASI TRAFO'
        AND pg.wo_sent_at >= t_awal AND pg.wo_sent_at < t_akhr
        AND (u IS NULL OR upper(pg.petugas_unit) = u)
        AND NOT EXISTS (SELECT 1 FROM public.optimasi_wo_batal b WHERE b.pengukuran_id::text = pg.id::text)),
    count(*)::numeric,
    count(*) FILTER (WHERE o.status = 'Selesai')::numeric,
    NULL::numeric
  FROM public.optimasi_trafo o
  -- Dikembalikan ke petugas = belum realisasi sampai dikirim ulang.
  WHERE o.status NOT IN ('Dibatalkan', 'Dikembalikan')
    AND o.tgl_operasi::date >= d_awal AND o.tgl_operasi::date < d_akhr
    AND (u IS NULL OR upper(o.ulp) = u);

  -- Pengukuran beban — WO Pengukuran.
  RETURN QUERY
  SELECT 'pengukuran'::text, count(*)::numeric,
    count(*) FILTER (WHERE r.terealisasi)::numeric,
    count(*) FILTER (WHERE r.tertahan)::numeric, NULL::numeric
  FROM public.wo_pengukuran_realisasi r
  WHERE r.tahun = p_tahun AND (p_bulan = 0 OR r.bulan = p_bulan)
    AND (u IS NULL OR upper(r.ulp) = u);

  -- Inspeksi JTM — km segmen yang inspeksinya selesai.
  -- WO terbit = km segmen dalam WO inspeksi JTM yang terbit di periode ini
  -- (keputusan a, `rencana-mobile-jtm-jtr.md`). `luar_wo` = km yang selesai
  -- TANPA WO — disebut terpisah (keputusan e), karena selama master tiang
  -- dibangun justru bagian inilah yang terbesar.
  RETURN QUERY
  SELECT 'jtm'::text,
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_inspeksi_item i
       JOIN public.wo_inspeksi w ON w.id = i.wo_id
      WHERE w.jenis = 'JTM' AND i.status <> 'Dibatalkan'
        AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
        AND (u IS NULL OR upper(i.ulp) = u)),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (WHERE m.status = 'Selesai'), 0), 3),
    round(COALESCE(sum(sp.panjang_pakai_km) FILTER (
      WHERE m.status IN ('Selesai', 'Diverifikasi') AND m.wo_item_id IS NULL), 0), 3)
  FROM public.inspeksi_jtm m
  LEFT JOIN public.segmen_panjang sp ON sp.segmen_id = m.segmen_id
  WHERE m.created_at >= t_awal AND m.created_at < t_akhr
    AND (u IS NULL OR upper(m.ulp) = u);

  -- Inspeksi JTR — km penghantar gardu (termasuk underbuild), kode + ULP.
  RETURN QUERY
  SELECT 'jtr'::text, NULL::numeric,
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status = 'Selesai'), 0), 3),
    NULL::numeric
  FROM public.inspeksi_jtr r
  LEFT JOIN LATERAL (
    SELECT sum(g.panjang_km) AS km FROM public.gardu_jtr_penghantar g
    WHERE g.gardu_kode = r.gardu_kode AND g.ulp = r.ulp
  ) pj ON true
  WHERE r.created_at >= t_awal AND r.created_at < t_akhr
    AND (u IS NULL OR upper(r.ulp) = u);
END $$;

GRANT EXECUTE ON FUNCTION public.rekap_kinerja(TEXT, INT, INT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM rekap_kinerja(NULL, 2026, 9);
--   SELECT * FROM wo_inspeksi_item_status;
