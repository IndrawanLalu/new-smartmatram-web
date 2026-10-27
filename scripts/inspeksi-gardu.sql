-- =============================================================================
-- Inspeksi Gardu Tier 1 / Tier 2 — G1 (26 Okt 2026)
-- Rencana: rencana-wo-gardu-dan-inspeksi-gardu.md. Jalankan manual di Supabase
-- SQL Editor SESUDAH hargardu-*.sql, master-usulan-schema.sql,
-- pengukuran-kunci-titik.sql, regu-inspeksi-dari-roles.sql. Idempoten.
--
-- Keputusan user 26 Okt:
--   • Satu kunjungan = satu gardu dari WO. Isian = TEMUAN SAJA:
--     "Tidak ada temuan" (wajib 1 foto gardu) atau satu/lebih temuan.
--   • Radius gardu seperti Pemeliharaan Gardu (dijaga di HP; di luar radius →
--     usulan titik lewat koreksi_titik_gardu, sama persis).
--   • Tier 1 & 2 isiannya sama; Tier 2 boleh menambah suhu / suhu pembanding.
--   • Temuan masuk "Perlu Perbaikan" Pemeliharaan Gardu.
--
-- Keputusan teknis:
--   • Tabel WO SENDIRI (wo_igardu / wo_igardu_item), BUKAN wo_inspeksi: 24
--     berkas SQL membaca wo_inspeksi (surat WO, garansi, tempel, rekap) dan
--     sebagian tanpa saringan jenis — WO gardu di sana akan bocor ke mana-mana.
--   • Kategori temuan (igardu_ref) WAJIB menunjuk item Pemeliharaan Gardu
--     (hargardu_item_ref): tindak_lanjut_gardu.item_kode ber-FK ke sana, jadi
--     "Jadikan WO" di Perlu Perbaikan langsung jalan, dan temuan HILANG
--     SENDIRI begitu pemeliharaan sesudahnya mencatat item itu normal.
--     Temuan tanpa item padanan memakai item tersembunyi 'temuan_lain'.
--   • Kode & ULP gardu disimpan PERSIS seperti di master `gardu` (pola
--     pemeliharaan_gardu) — HP mencari Perlu Perbaikan dengan .eq() biasa.
--   • Semua UPDATE/DELETE ber-WHERE (safeupdate Supabase).
--
--   1. Acuan kategori temuan           igardu_ref (+ item 'temuan_lain')
--   2. WO                               wo_igardu, wo_igardu_item
--   3. Kunjungan & temuan               inspeksi_gardu, inspeksi_gardu_temuan
--   4. RPC WO (web)                     terbitkan / tambah / tugaskan / keluarkan / batalkan
--   5. RPC kirim (HP)                   kirim_inspeksi_gardu
--   6. RPC periksa (web)                verifikasi / kembalikan / batalkan / selesaikan temuan
--   7. View                             wo_igardu_item_status, wo_igardu_capaian,
--                                       inspeksi_gardu_daftar, gardu_perlu_perbaikan ★
--   8. Regu                             regu_inspeksi + kolom igardu
--   9. Hak akses
-- =============================================================================


-- ── 1. Kategori temuan ───────────────────────────────────────────────────────
INSERT INTO public.hargardu_item_ref (kode, nama, kelompok, dimensi, tipe, wajib, urutan, aktif, tampil_dashboard, keterangan)
VALUES ('temuan_lain', 'Temuan lain (Inspeksi Gardu)', 'Lainnya', 'tunggal', 'pilihan', false, 999, false, false,
        'JANGAN DIAKTIFKAN. Penampung temuan Inspeksi Gardu yang tidak punya item pemeliharaan (ROW, pohon, bangunan) — supaya bisa dijadikan WO di Perlu Perbaikan.')
ON CONFLICT (kode) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.igardu_ref (
  kode       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  item_kode  TEXT NOT NULL REFERENCES public.hargardu_item_ref (kode),
  urutan     INT     NOT NULL DEFAULT 100,
  aktif      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Satu item pemeliharaan satu kategori: baris Perlu Perbaikan unik per
-- (gardu, ULP, item, bagian), dan bagian temuan = "Inspeksi T<tier> <tgl>".
CREATE UNIQUE INDEX IF NOT EXISTS igardu_ref_item_unik ON public.igardu_ref (item_kode);
COMMENT ON TABLE public.igardu_ref IS
  'Kategori temuan Inspeksi Gardu. item_kode = item Pemeliharaan Gardu padanannya (Perlu Perbaikan & Jadikan WO).';

-- Isian awal — TEBAKAN, disunting dari Pengaturan.
INSERT INTO public.igardu_ref (kode, label, item_kode, urutan) VALUES
  ('fco',        'Cut out / FCO',               'cut_out',          10),
  ('tekep',      'Tekep (FCO/arrester/bushing)', 'tekep_fco',       20),
  ('arrester',   'Arrester',                    'arrester',         30),
  ('jumperan',   'Jumperan',                    'jumperan_trafo',   40),
  ('bushing',    'Bushing',                     'bushing_primer',   50),
  ('trafo',      'Trafo (fisik, bocor, rembes)', 'kondisi_trafo',   60),
  ('minyak',     'Minyak trafo',                'minyak_trafo',     70),
  ('phb_tr',     'PHB TR / LV board',           'lv_board',         80),
  ('busbar',     'Busbar TR',                   'busbar_tr',        90),
  ('outlet',     'Kabel / sambungan outlet',    'sambungan_outlet', 100),
  ('bangunan',   'Lantai kerja / papan injak',  'lantai_kerja',     110),
  ('lainnya',    'Lainnya (ROW, pohon, dll)',   'temuan_lain',      999)
ON CONFLICT (kode) DO NOTHING;


-- ── 2. WO ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wo_igardu (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ulp          TEXT NOT NULL,
  tier         TEXT NOT NULL DEFAULT '1',
  nama         TEXT NOT NULL,
  tgl_wo       DATE NOT NULL,
  target       INT,                         -- jumlah gardu
  status       TEXT NOT NULL DEFAULT 'Terbit',
  batal_alasan TEXT,
  batal_oleh   TEXT,
  batal_at     TIMESTAMPTZ,
  created_by   UUID,
  created_oleh TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wo_igardu_tier_valid   CHECK (tier IN ('1', '2')),
  CONSTRAINT wo_igardu_status_valid CHECK (status IN ('Terbit', 'Selesai', 'Dibatalkan'))
);
CREATE INDEX IF NOT EXISTS wo_igardu_ulp_idx ON public.wo_igardu (ulp, tgl_wo DESC);

CREATE TABLE IF NOT EXISTS public.wo_igardu_item (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id       UUID NOT NULL REFERENCES public.wo_igardu (id) ON DELETE CASCADE,
  tier        TEXT NOT NULL,               -- salinan tier WO (indeks unik)
  urutan      INT  NOT NULL DEFAULT 0,
  ulp         TEXT NOT NULL,               -- persis master gardu
  gardu_kode  TEXT NOT NULL,               -- persis master gardu
  gardu_nama  TEXT,
  penyulang   TEXT,
  regu        TEXT,
  status      TEXT NOT NULL DEFAULT 'Terbuka',
  catatan     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wo_igardu_item_status_valid CHECK (status IN ('Terbuka', 'Selesai', 'Dibatalkan'))
);
CREATE INDEX IF NOT EXISTS wo_igardu_item_wo_idx ON public.wo_igardu_item (wo_id, urutan);
CREATE INDEX IF NOT EXISTS wo_igardu_item_ulp_idx ON public.wo_igardu_item (ulp, status);
-- Satu gardu satu WO terbuka PER TIER (Tier 1 & 2 boleh bersamaan).
CREATE UNIQUE INDEX IF NOT EXISTS wo_igardu_item_terbuka
  ON public.wo_igardu_item (gardu_kode, ulp, tier) WHERE status = 'Terbuka';


-- ── 3. Kunjungan & temuan ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inspeksi_gardu (
  id            UUID PRIMARY KEY,           -- dibuat HP (kirim ulang aman)
  gardu_kode    TEXT NOT NULL,
  ulp           TEXT NOT NULL,
  penyulang     TEXT,
  tier          TEXT NOT NULL,
  wo_item_id    UUID REFERENCES public.wo_igardu_item (id) ON DELETE SET NULL,
  tgl           TIMESTAMPTZ NOT NULL,       -- saat regu menekan Simpan di HP
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  akurasi       NUMERIC,
  jarak_m       NUMERIC,                    -- ke titik master saat dikirim
  foto_gardu_url TEXT,                      -- wajib bila tanpa temuan
  ada_temuan    BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'Selesai',
  petugas_uid   UUID,
  petugas_nama  TEXT,
  catatan       TEXT,
  verified_at   TIMESTAMPTZ,
  verified_by   TEXT,
  dikembalikan_at     TIMESTAMPTZ,
  dikembalikan_alasan TEXT,
  dikembalikan_oleh   TEXT,
  batal_alasan  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inspeksi_gardu_tier_valid   CHECK (tier IN ('1', '2')),
  CONSTRAINT inspeksi_gardu_status_valid CHECK (status IN ('Selesai', 'Diverifikasi', 'Dikembalikan', 'Dibatalkan'))
);
CREATE INDEX IF NOT EXISTS inspeksi_gardu_ulp_idx   ON public.inspeksi_gardu (ulp, tgl DESC);
CREATE INDEX IF NOT EXISTS inspeksi_gardu_wo_idx    ON public.inspeksi_gardu (wo_item_id) WHERE wo_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inspeksi_gardu_gardu_idx ON public.inspeksi_gardu (gardu_kode, ulp, tier, tgl DESC);

CREATE TABLE IF NOT EXISTS public.inspeksi_gardu_temuan (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspeksi_id     UUID NOT NULL REFERENCES public.inspeksi_gardu (id) ON DELETE CASCADE,
  urutan          INT  NOT NULL DEFAULT 1,
  kategori        TEXT NOT NULL REFERENCES public.igardu_ref (kode),
  uraian          TEXT NOT NULL,
  prioritas       TEXT NOT NULL DEFAULT 'Biasa',
  foto_url        TEXT[] NOT NULL DEFAULT '{}',
  suhu            NUMERIC,                  -- Tier 2, titik panas
  suhu_pembanding NUMERIC,
  -- Tindak lanjut: Terbuka sampai admin menandai Selesai (pemeliharaan yang
  -- mencatat itemnya normal menghilangkannya dari Perlu Perbaikan tanpa ini).
  status_tl       TEXT NOT NULL DEFAULT 'Terbuka',
  selesai_at      TIMESTAMPTZ,
  selesai_oleh    TEXT,
  selesai_catatan TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT igardu_temuan_prioritas_valid CHECK (prioritas IN ('Urgent', 'Rawan', 'Biasa')),
  CONSTRAINT igardu_temuan_tl_valid        CHECK (status_tl IN ('Terbuka', 'Selesai')),
  CONSTRAINT igardu_temuan_kategori_unik   UNIQUE (inspeksi_id, kategori)
);
CREATE INDEX IF NOT EXISTS igardu_temuan_terbuka_idx
  ON public.inspeksi_gardu_temuan (inspeksi_id) WHERE status_tl = 'Terbuka';


-- Indeks untuk view di bagian 7 (tabel lama, belum punya):
--   • usulan titik yang menunggu per sumber (tertahan / gugur);
--   • pemeliharaan terverifikasi per gardu (temuan hilang sendiri).
CREATE INDEX IF NOT EXISTS master_usulan_sumber_menunggu_idx
  ON public.master_usulan (sumber_modul, sumber_id) WHERE status = 'menunggu';
CREATE INDEX IF NOT EXISTS pemeliharaan_gardu_terverifikasi_idx
  ON public.pemeliharaan_gardu (gardu_kode, ulp, tgl_selesai) WHERE status = 'Diverifikasi';


-- ── 4. RPC WO (web) ──────────────────────────────────────────────────────────
-- Gardu dicari di master per (kode, ULP) tanpa peka huruf; nilai yang disimpan
-- = nilai master apa adanya. Kode kembar di master (13 kasus, gardu-janggal)
-- → yang pertama menurut id; sama dengan Pemeliharaan Gardu.
CREATE OR REPLACE FUNCTION public._igardu_master(p_kode TEXT, p_ulp TEXT)
RETURNS TABLE (kode TEXT, ulp TEXT, nama TEXT, feeder TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT g.kode, g.ulp, g.nama, g.feeder, g.lat, g.lng
  FROM public.gardu g
  WHERE upper(btrim(g.kode)) = upper(btrim(p_kode)) AND upper(btrim(g.ulp)) = upper(btrim(p_ulp))
  ORDER BY g.id
  LIMIT 1;
$fn$;

-- Sisipkan gardu-gardu ke satu WO. Dipakai terbitkan & tambah.
CREATE OR REPLACE FUNCTION public._igardu_isi_wo(p_wo UUID, p_gardu TEXT[], p_regu JSONB)
RETURNS JSONB
LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  w        public.wo_igardu;
  k        TEXT;
  g        RECORD;
  n        INT := 0;
  urut     INT;
  dilewati JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO w FROM public.wo_igardu WHERE id = p_wo;
  SELECT COALESCE(max(urutan), 0) INTO urut FROM public.wo_igardu_item WHERE wo_id = p_wo;
  -- Urutan pilihan admin dipertahankan; kode kembar dalam satu kiriman sekali saja.
  FOR k IN SELECT s.x FROM (
             SELECT DISTINCT ON (upper(btrim(t.x))) btrim(t.x) AS x, t.o
             FROM unnest(COALESCE(p_gardu, '{}')) WITH ORDINALITY AS t(x, o)
             WHERE btrim(COALESCE(t.x, '')) <> ''
             ORDER BY upper(btrim(t.x)), t.o) s
           ORDER BY s.o LOOP
    SELECT * INTO g FROM public._igardu_master(k, w.ulp);
    IF g.kode IS NULL THEN
      dilewati := dilewati || jsonb_build_object('gardu', k, 'sebab', format('Tidak ada di master gardu ULP %s.', w.ulp));
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.wo_igardu_item i
               WHERE i.gardu_kode = g.kode AND i.ulp = g.ulp AND i.tier = w.tier AND i.status = 'Terbuka') THEN
      dilewati := dilewati || jsonb_build_object('gardu', g.kode, 'sebab', format('Masih terbuka di WO Inspeksi Gardu Tier %s lain.', w.tier));
      CONTINUE;
    END IF;
    urut := urut + 1;
    n := n + 1;
    INSERT INTO public.wo_igardu_item (wo_id, tier, urutan, ulp, gardu_kode, gardu_nama, penyulang, regu)
    VALUES (p_wo, w.tier, urut, g.ulp, g.kode, g.nama, g.feeder,
            NULLIF(btrim(COALESCE(p_regu->>k, p_regu->>g.kode, '')), ''));
  END LOOP;
  RETURN jsonb_build_object('item', n, 'dilewati', dilewati);
END $fn$;

CREATE OR REPLACE FUNCTION public.terbitkan_wo_igardu(
  p_ulp    TEXT,
  p_nama   TEXT,
  p_target INT,
  p_gardu  TEXT[],
  p_tgl_wo DATE,
  p_regu   JSONB DEFAULT '{}'::jsonb,
  p_oleh   TEXT  DEFAULT NULL,
  p_tier   TEXT  DEFAULT '1'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  unit  TEXT := upper(btrim(COALESCE(p_ulp, '')));
  v_tier TEXT := btrim(COALESCE(p_tier, '1'));
  wo    UUID;
  h     JSONB;
BEGIN
  IF unit = '' THEN RAISE EXCEPTION 'ULP wajib dipilih.'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);
  IF v_tier NOT IN ('1', '2') THEN RAISE EXCEPTION 'Tier WO harus 1 atau 2.'; END IF;
  IF btrim(COALESCE(p_nama, '')) = '' THEN RAISE EXCEPTION 'Nama WO wajib diisi.'; END IF;
  IF p_tgl_wo IS NULL THEN RAISE EXCEPTION 'Bulan WO wajib diisi.'; END IF;
  IF COALESCE(cardinality(p_gardu), 0) = 0 THEN RAISE EXCEPTION 'Pilih minimal satu gardu.'; END IF;

  INSERT INTO public.wo_igardu (ulp, tier, nama, tgl_wo, target, created_by, created_oleh)
  VALUES (unit, v_tier, btrim(p_nama), date_trunc('month', p_tgl_wo)::date, p_target, auth.uid(), p_oleh)
  RETURNING id INTO wo;

  h := public._igardu_isi_wo(wo, p_gardu, COALESCE(p_regu, '{}'::jsonb));
  IF (h->>'item')::int = 0 THEN
    RAISE EXCEPTION 'Tidak ada gardu yang bisa masuk WO: %', h->'dilewati';
  END IF;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_igardu', btrim(p_nama), unit, 'terbit', NULL,
          jsonb_build_object('wo_id', wo, 'tier', v_tier, 'item', h->'item', 'target', p_target),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('wo_id', wo, 'tier', v_tier, 'item', h->'item', 'dilewati', h->'dilewati');
END $fn$;

CREATE OR REPLACE FUNCTION public.tambah_wo_igardu(
  p_wo_id  UUID,
  p_gardu  TEXT[],
  p_regu   JSONB DEFAULT '{}'::jsonb,
  p_target INT   DEFAULT NULL,
  p_oleh   TEXT  DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  w public.wo_igardu;
  h JSONB;
BEGIN
  SELECT * INTO w FROM public.wo_igardu WHERE id = p_wo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WO tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(w.ulp);
  IF w.status <> 'Terbit' THEN RAISE EXCEPTION 'WO "%" sudah berstatus %.', w.nama, w.status; END IF;

  h := public._igardu_isi_wo(w.id, p_gardu, COALESCE(p_regu, '{}'::jsonb));
  IF p_target IS NOT NULL THEN
    UPDATE public.wo_igardu SET target = p_target, updated_at = now() WHERE id = w.id;
  END IF;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_igardu', w.nama, w.ulp, 'tambah_item', NULL,
          jsonb_build_object('wo_id', w.id, 'item', h->'item', 'target', p_target), 'sunting_admin', auth.uid(), p_oleh);
  RETURN h;
END $fn$;

CREATE OR REPLACE FUNCTION public.tugaskan_regu_igardu(p_item_id UUID, p_regu TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE it public.wo_igardu_item;
BEGIN
  SELECT * INTO it FROM public.wo_igardu_item WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item WO tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(it.ulp);
  IF it.status <> 'Terbuka' THEN RAISE EXCEPTION 'Gardu % sudah berstatus %.', it.gardu_kode, it.status; END IF;
  UPDATE public.wo_igardu_item SET regu = NULLIF(btrim(COALESCE(p_regu, '')), ''), updated_at = now()
  WHERE id = p_item_id;
END $fn$;

-- Sudah diinspeksi = ada kunjungan yang tidak dibatalkan.
CREATE OR REPLACE FUNCTION public._igardu_item_dikerjakan(p_item UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.inspeksi_gardu x WHERE x.wo_item_id = p_item AND x.status <> 'Dibatalkan');
$fn$;

CREATE OR REPLACE FUNCTION public.keluarkan_wo_igardu(p_item_id UUID[], p_alasan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it       public.wo_igardu_item;
  n        INT := 0;
  dilewati JSONB := '[]'::jsonb;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan wajib diisi.'; END IF;
  FOR it IN SELECT * FROM public.wo_igardu_item WHERE id = ANY (COALESCE(p_item_id, '{}')) ORDER BY urutan FOR UPDATE LOOP
    PERFORM public.wajib_boleh_ulp(it.ulp);
    IF it.status <> 'Terbuka' THEN
      dilewati := dilewati || jsonb_build_object('gardu', it.gardu_kode, 'sebab', 'Sudah ' || it.status);
    ELSIF public._igardu_item_dikerjakan(it.id) THEN
      dilewati := dilewati || jsonb_build_object('gardu', it.gardu_kode, 'sebab', 'Sudah diinspeksi regu');
    ELSE
      UPDATE public.wo_igardu_item
      SET status = 'Dibatalkan', catatan = 'Dikeluarkan: ' || btrim(p_alasan), updated_at = now()
      WHERE id = it.id;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('keluar', n, 'dilewati', dilewati);
END $fn$;

CREATE OR REPLACE FUNCTION public.batalkan_wo_igardu(p_wo_id UUID, p_alasan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  w     public.wo_igardu;
  jalan INT;
  n     INT;
BEGIN
  SELECT * INTO w FROM public.wo_igardu WHERE id = p_wo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WO tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(w.ulp);
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan WO wajib diisi.'; END IF;
  IF w.status <> 'Terbit' THEN RAISE EXCEPTION 'WO "%" sudah berstatus %.', w.nama, w.status; END IF;
  SELECT count(*) INTO jalan FROM public.wo_igardu_item i
  WHERE i.wo_id = p_wo_id AND i.status <> 'Dibatalkan' AND public._igardu_item_dikerjakan(i.id);
  IF jalan > 0 THEN
    RAISE EXCEPTION 'WO "%" tidak bisa dibatalkan: % gardu sudah diinspeksi regu. Keluarkan saja yang belum.', w.nama, jalan;
  END IF;

  UPDATE public.wo_igardu_item
  SET status = 'Dibatalkan', catatan = 'WO dibatalkan: ' || btrim(p_alasan), updated_at = now()
  WHERE wo_id = p_wo_id AND status = 'Terbuka';
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.wo_igardu
  SET status = 'Dibatalkan', batal_alasan = btrim(p_alasan), batal_oleh = p_oleh, batal_at = now(), updated_at = now()
  WHERE id = p_wo_id;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_igardu', w.nama, w.ulp, 'dibatalkan', to_jsonb(w.status),
          jsonb_build_object('alasan', btrim(p_alasan), 'item', n), 'sunting_admin', auth.uid(), p_oleh);
  RETURN n;
END $fn$;


-- ── 5. Kirim dari HP ─────────────────────────────────────────────────────────
-- p_isi: id, gardu_kode, ulp, tier, wo_item_id?, tgl, lat, lng, akurasi,
--        foto_gardu_url, petugas_nama, catatan,
--        temuan: [{kategori, uraian, prioritas, foto[], suhu?, suhu_pembanding?}],
--        koreksi?: {lat, lng, akurasi, catatan, foto[]}   (pola Pemeliharaan Gardu)
CREATE OR REPLACE FUNCTION public.kirim_inspeksi_gardu(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id    UUID := NULLIF(p_isi->>'id', '')::uuid;
  v_tier  TEXT := btrim(COALESCE(p_isi->>'tier', ''));
  v_nama  TEXT := NULLIF(btrim(COALESCE(p_isi->>'petugas_nama', '')), '');
  v_fg    TEXT := NULLIF(btrim(COALESCE(p_isi->>'foto_gardu_url', '')), '');
  v_lat   DOUBLE PRECISION := NULLIF(p_isi->>'lat', '')::double precision;
  v_lng   DOUBLE PRECISION := NULLIF(p_isi->>'lng', '')::double precision;
  v_tgl   TIMESTAMPTZ := LEAST(COALESCE(NULLIF(p_isi->>'tgl', '')::timestamptz, now()), now());
  v_tem   JSONB := CASE WHEN jsonb_typeof(p_isi->'temuan') = 'array' THEN p_isi->'temuan' ELSE '[]'::jsonb END;
  kor     JSONB := p_isi->'koreksi';
  v_role  TEXT;
  v_unit  TEXT;
  g       RECORD;
  ada     public.inspeksi_gardu;
  lain    public.inspeksi_gardu;
  v_item  UUID;
  it      public.wo_igardu_item;
  t       JSONB;
  n       INT := 0;
  bulan   TIMESTAMPTZ;
BEGIN
  IF v_id IS NULL OR btrim(COALESCE(p_isi->>'gardu_kode', '')) = '' OR btrim(COALESCE(p_isi->>'ulp', '')) = '' THEN
    RAISE EXCEPTION 'Kiriman tidak lengkap: id, gardu, dan ULP wajib ada.';
  END IF;
  IF v_tier NOT IN ('1', '2') THEN RAISE EXCEPTION 'Tier harus 1 atau 2.'; END IF;

  -- Hak kirim: UP3 semua ULP; selain itu ULP sendiri (pola Pemeliharaan Gardu).
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;

  SELECT * INTO g FROM public._igardu_master(p_isi->>'gardu_kode', p_isi->>'ulp');
  IF g.kode IS NULL THEN
    RAISE EXCEPTION 'Gardu % di ULP % tidak ada di master.', p_isi->>'gardu_kode', p_isi->>'ulp';
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(g.ulp) THEN
    RAISE EXCEPTION 'Akun ini untuk ULP %, bukan %.', COALESCE(v_unit, '-'), g.ulp;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('kirim-igardu|' || upper(g.kode) || '|' || upper(g.ulp) || '|' || v_tier));

  SELECT * INTO ada FROM public.inspeksi_gardu WHERE id = v_id FOR UPDATE;
  IF FOUND THEN
    IF ada.gardu_kode <> g.kode OR ada.ulp <> g.ulp THEN
      RAISE EXCEPTION 'Id kiriman ini milik gardu %, bukan %.', ada.gardu_kode, g.kode;
    END IF;
    IF ada.status <> 'Dikembalikan' THEN
      -- Kiriman ulang sesudah jawaban server hilang di jalan.
      RETURN jsonb_build_object('id', v_id, 'sudah_ada', true);
    END IF;
  END IF;

  -- Satu gardu satu kunjungan per tier per bulan (WITA).
  bulan := date_trunc('month', v_tgl AT TIME ZONE 'Asia/Makassar') AT TIME ZONE 'Asia/Makassar';
  SELECT * INTO lain FROM public.inspeksi_gardu
  WHERE gardu_kode = g.kode AND ulp = g.ulp AND tier = v_tier AND id <> v_id
    AND status IN ('Selesai', 'Diverifikasi')
    AND tgl >= bulan AND tgl < bulan + INTERVAL '1 month'
  ORDER BY tgl DESC LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Gardu % Tier % sudah dikirim % pada % — tidak dikirim dua kali.',
      g.kode, v_tier, COALESCE(lain.petugas_nama, 'regu lain'), to_char(lain.tgl AT TIME ZONE 'Asia/Makassar', 'DD-MM-YYYY');
  END IF;

  -- Temuan: periksa semua dulu.
  IF jsonb_array_length(v_tem) > 20 THEN RAISE EXCEPTION 'Paling banyak 20 temuan per gardu.'; END IF;
  IF (SELECT count(DISTINCT x->>'kategori') FROM jsonb_array_elements(v_tem) x) < jsonb_array_length(v_tem) THEN
    RAISE EXCEPTION 'Satu kategori temuan cukup sekali per gardu — gabungkan uraiannya.';
  END IF;
  FOR t IN SELECT * FROM jsonb_array_elements(v_tem) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.igardu_ref r WHERE r.kode = t->>'kategori' AND r.aktif) THEN
      RAISE EXCEPTION 'Kategori temuan "%" tidak ada di daftar yang aktif.', t->>'kategori';
    END IF;
    IF btrim(COALESCE(t->>'uraian', '')) = '' THEN RAISE EXCEPTION 'Uraian temuan wajib diisi.'; END IF;
    IF COALESCE(t->>'prioritas', 'Biasa') NOT IN ('Urgent', 'Rawan', 'Biasa') THEN
      RAISE EXCEPTION 'Kategori temuan harus Urgent, Rawan, atau Biasa.';
    END IF;
    IF jsonb_typeof(t->'foto') IS DISTINCT FROM 'array' OR jsonb_array_length(t->'foto') = 0 THEN
      RAISE EXCEPTION 'Setiap temuan wajib berfoto.';
    END IF;
    IF jsonb_array_length(t->'foto') > 3 THEN RAISE EXCEPTION 'Paling banyak 3 foto per temuan.'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(t->'foto') f WHERE f NOT LIKE 'http%') THEN
      RAISE EXCEPTION 'Foto temuan belum terunggah. Kirim ulang saat sinyal lebih baik.';
    END IF;
  END LOOP;
  IF jsonb_array_length(v_tem) = 0 AND v_fg IS NULL THEN
    RAISE EXCEPTION 'Tanpa temuan, foto gardu wajib — sebagai bukti kunjungan.';
  END IF;
  IF v_fg IS NOT NULL AND v_fg NOT LIKE 'http%' THEN
    RAISE EXCEPTION 'Foto gardu belum terunggah. Kirim ulang saat sinyal lebih baik.';
  END IF;

  -- Item WO: yang dikirim HP (harus cocok), atau item terbuka gardu+tier ini.
  v_item := NULLIF(p_isi->>'wo_item_id', '')::uuid;
  IF v_item IS NOT NULL THEN
    SELECT * INTO it FROM public.wo_igardu_item WHERE id = v_item;
    IF NOT FOUND OR it.gardu_kode <> g.kode OR it.ulp <> g.ulp OR it.tier <> v_tier OR it.status <> 'Terbuka' THEN
      v_item := NULL;
    END IF;
  END IF;
  IF v_item IS NULL THEN
    SELECT i.id INTO v_item FROM public.wo_igardu_item i
    WHERE i.gardu_kode = g.kode AND i.ulp = g.ulp AND i.tier = v_tier AND i.status = 'Terbuka'
    LIMIT 1;
  END IF;

  IF ada.id IS NULL THEN
    INSERT INTO public.inspeksi_gardu (id, gardu_kode, ulp, tier, tgl, petugas_uid)
    VALUES (v_id, g.kode, g.ulp, v_tier, v_tgl, auth.uid());
  END IF;
  UPDATE public.inspeksi_gardu SET
    penyulang      = g.feeder,
    tier           = v_tier,
    wo_item_id     = v_item,
    tgl            = v_tgl,
    lat            = v_lat,
    lng            = v_lng,
    akurasi        = NULLIF(p_isi->>'akurasi', '')::numeric,
    jarak_m        = CASE WHEN v_lat IS NULL OR v_lng IS NULL OR g.lat IS NULL OR g.lng IS NULL THEN NULL
                          ELSE round(public.jarak_meter(g.lat, g.lng, v_lat, v_lng)::numeric, 1) END,
    foto_gardu_url = v_fg,
    ada_temuan     = jsonb_array_length(v_tem) > 0,
    status         = 'Selesai',
    petugas_uid    = auth.uid(),
    petugas_nama   = COALESCE(v_nama, petugas_nama),
    catatan        = NULLIF(btrim(COALESCE(p_isi->>'catatan', '')), ''),
    verified_at = NULL, verified_by = NULL,
    updated_at     = now()
  WHERE id = v_id;

  -- Kiriman ulang yang dikembalikan: temuan lama diganti seluruhnya.
  DELETE FROM public.inspeksi_gardu_temuan WHERE inspeksi_id = v_id;
  FOR t IN SELECT * FROM jsonb_array_elements(v_tem) LOOP
    n := n + 1;
    INSERT INTO public.inspeksi_gardu_temuan
      (inspeksi_id, urutan, kategori, uraian, prioritas, foto_url, suhu, suhu_pembanding)
    VALUES (v_id, n, t->>'kategori', btrim(t->>'uraian'), COALESCE(t->>'prioritas', 'Biasa'),
            ARRAY(SELECT jsonb_array_elements_text(t->'foto')),
            CASE WHEN v_tier = '2' THEN NULLIF(t->>'suhu', '')::numeric END,
            CASE WHEN v_tier = '2' THEN NULLIF(t->>'suhu_pembanding', '')::numeric END);
  END LOOP;

  -- Usulan titik gardu — persis Pemeliharaan Gardu.
  IF jsonb_typeof(kor) = 'object' AND NULLIF(kor->>'lat', '') IS NOT NULL THEN
    IF jsonb_typeof(kor->'foto') IS DISTINCT FROM 'array' OR jsonb_array_length(kor->'foto') = 0 THEN
      RAISE EXCEPTION 'Usulan titik % wajib berfoto papan nama gardu.', g.kode;
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(kor->'foto') f WHERE f NOT LIKE 'http%') THEN
      RAISE EXCEPTION 'Foto papan nama untuk usulan titik % belum terunggah.', g.kode;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.master_usulan u
                   WHERE u.sumber_modul = 'inspeksi_gardu' AND u.sumber_id = v_id
                     AND u.field = 'koordinat' AND u.status = 'menunggu') THEN
      PERFORM public.koreksi_titik_gardu(
        g.kode, g.ulp,
        (kor->>'lat')::double precision, (kor->>'lng')::double precision,
        NULLIF(kor->>'akurasi', '')::numeric, v_nama, NULLIF(btrim(kor->>'catatan'), ''),
        'inspeksi_gardu', v_id, ARRAY(SELECT jsonb_array_elements_text(kor->'foto')));
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'sudah_ada', false, 'temuan', n, 'wo_item_id', v_item);
END $fn$;


-- ── 6. Periksa di web ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verifikasi_inspeksi_gardu(p_id UUID, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE x public.inspeksi_gardu;
BEGIN
  SELECT * INTO x FROM public.inspeksi_gardu WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspeksi tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(x.ulp);
  IF x.status <> 'Selesai' THEN RAISE EXCEPTION 'Inspeksi gardu % berstatus % — tidak bisa disetujui.', x.gardu_kode, x.status; END IF;
  UPDATE public.inspeksi_gardu SET status = 'Diverifikasi', verified_at = now(), verified_by = p_oleh, updated_at = now()
  WHERE id = p_id;
  IF x.wo_item_id IS NOT NULL THEN
    UPDATE public.wo_igardu_item SET status = 'Selesai', updated_at = now()
    WHERE id = x.wo_item_id AND status = 'Terbuka';
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.kembalikan_inspeksi_gardu(p_id UUID, p_alasan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE x public.inspeksi_gardu;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan wajib diisi.'; END IF;
  SELECT * INTO x FROM public.inspeksi_gardu WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspeksi tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(x.ulp);
  IF x.status <> 'Selesai' THEN RAISE EXCEPTION 'Hanya yang menunggu persetujuan yang bisa dikembalikan (status %).', x.status; END IF;
  UPDATE public.inspeksi_gardu
  SET status = 'Dikembalikan', dikembalikan_at = now(), dikembalikan_alasan = btrim(p_alasan),
      dikembalikan_oleh = p_oleh, updated_at = now()
  WHERE id = p_id;
  -- Usulan titik dari kiriman ini gugur (pola Pemeliharaan Gardu).
  UPDATE public.master_usulan
  SET status = 'ditolak', penilai_nama = p_oleh, dinilai_at = now(),
      alasan = 'Inspeksi gardunya dikembalikan: ' || btrim(p_alasan)
  WHERE sumber_modul = 'inspeksi_gardu' AND sumber_id = p_id AND status = 'menunggu';
END $fn$;

CREATE OR REPLACE FUNCTION public.batalkan_inspeksi_gardu(p_id UUID, p_alasan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE x public.inspeksi_gardu;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan wajib diisi.'; END IF;
  SELECT * INTO x FROM public.inspeksi_gardu WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspeksi tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(x.ulp);
  IF x.status = 'Dibatalkan' THEN RAISE EXCEPTION 'Sudah dibatalkan.'; END IF;
  UPDATE public.inspeksi_gardu
  SET status = 'Dibatalkan', batal_alasan = btrim(p_alasan), verified_by = p_oleh, updated_at = now()
  WHERE id = p_id;
  -- Item WO yang sempat tertutup oleh kunjungan ini dibuka lagi.
  IF x.wo_item_id IS NOT NULL THEN
    UPDATE public.wo_igardu_item SET status = 'Terbuka', updated_at = now()
    WHERE id = x.wo_item_id AND status = 'Selesai'
      AND NOT EXISTS (SELECT 1 FROM public.wo_igardu_item o
                      WHERE o.gardu_kode = x.gardu_kode AND o.ulp = x.ulp AND o.tier = x.tier
                        AND o.status = 'Terbuka');
  END IF;
  UPDATE public.master_usulan
  SET status = 'ditolak', penilai_nama = p_oleh, dinilai_at = now(),
      alasan = 'Inspeksi gardunya dibatalkan: ' || btrim(p_alasan)
  WHERE sumber_modul = 'inspeksi_gardu' AND sumber_id = p_id AND status = 'menunggu';
END $fn$;

CREATE OR REPLACE FUNCTION public.selesaikan_temuan_igardu(p_temuan_id UUID, p_catatan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_ulp TEXT;
BEGIN
  SELECT x.ulp INTO v_ulp FROM public.inspeksi_gardu_temuan t JOIN public.inspeksi_gardu x ON x.id = t.inspeksi_id
  WHERE t.id = p_temuan_id;
  IF v_ulp IS NULL THEN RAISE EXCEPTION 'Temuan tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(v_ulp);
  UPDATE public.inspeksi_gardu_temuan
  SET status_tl = 'Selesai', selesai_at = now(), selesai_oleh = p_oleh, selesai_catatan = NULLIF(btrim(COALESCE(p_catatan, '')), '')
  WHERE id = p_temuan_id AND status_tl = 'Terbuka';
  IF NOT FOUND THEN RAISE EXCEPTION 'Temuan sudah ditandai selesai.'; END IF;
END $fn$;


-- ── 7. View ──────────────────────────────────────────────────────────────────
-- Kunjungan terakhir (tidak dibatalkan) per item WO.
CREATE OR REPLACE VIEW public.wo_igardu_item_status AS
SELECT i.id, i.wo_id, i.tier, i.urutan, i.ulp, i.gardu_kode, i.gardu_nama, i.penyulang, i.regu,
       i.status, i.catatan, i.created_at, i.updated_at,
       w.nama AS wo_nama, w.tgl_wo,
       x.id AS inspeksi_id, x.status AS inspeksi_status, x.petugas_nama AS inspeksi_petugas,
       x.tgl AS inspeksi_tgl, x.ada_temuan AS inspeksi_ada_temuan
FROM public.wo_igardu_item i
JOIN public.wo_igardu w ON w.id = i.wo_id
LEFT JOIN LATERAL (
  SELECT g.id, g.status, g.petugas_nama, g.tgl, g.ada_temuan
  FROM public.inspeksi_gardu g
  WHERE g.wo_item_id = i.id AND g.status <> 'Dibatalkan'
  ORDER BY g.tgl DESC
  LIMIT 1
) x ON true;

-- Realisasi = gardu WO yang kunjungannya sudah DIKIRIM (Selesai/Diverifikasi),
-- kecuali yang tertahan usulan titik (pola Pemeliharaan Gardu).
CREATE OR REPLACE VIEW public.wo_igardu_capaian AS
SELECT w.id AS wo_id, w.ulp, w.tier, w.nama, w.tgl_wo, w.target, w.status, w.created_at,
       count(i.id) FILTER (WHERE i.status <> 'Dibatalkan')                      AS item,
       count(i.id) FILTER (WHERE i.status <> 'Dibatalkan' AND r.terkirim)       AS item_terkirim,
       count(i.id) FILTER (WHERE i.status = 'Selesai')                          AS item_selesai
FROM public.wo_igardu w
LEFT JOIN public.wo_igardu_item i ON i.wo_id = w.id
LEFT JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1 FROM public.inspeksi_gardu g
    WHERE g.wo_item_id = i.id AND g.status IN ('Selesai', 'Diverifikasi')
      AND NOT EXISTS (SELECT 1 FROM public.master_usulan u
                      WHERE u.sumber_modul = 'inspeksi_gardu' AND u.sumber_id = g.id AND u.status = 'menunggu')
  ) AS terkirim
) r ON true
GROUP BY w.id;

CREATE OR REPLACE VIEW public.inspeksi_gardu_daftar AS
SELECT x.id, x.gardu_kode, x.ulp, x.penyulang, x.tier, x.wo_item_id, x.tgl, x.lat, x.lng, x.akurasi, x.jarak_m,
       x.foto_gardu_url, x.ada_temuan, x.status, x.petugas_nama, x.catatan,
       x.verified_at, x.verified_by, x.dikembalikan_at, x.dikembalikan_alasan, x.dikembalikan_oleh,
       x.batal_alasan, x.created_at,
       g.nama AS gardu_nama,
       w.nama AS wo_nama, w.tgl_wo,
       (SELECT count(*) FROM public.inspeksi_gardu_temuan t WHERE t.inspeksi_id = x.id)::int AS jumlah_temuan,
       (SELECT CASE WHEN bool_or(t.prioritas = 'Urgent') THEN 'Urgent'
                    WHEN bool_or(t.prioritas = 'Rawan') THEN 'Rawan'
                    WHEN count(*) > 0 THEN 'Biasa' END
        FROM public.inspeksi_gardu_temuan t WHERE t.inspeksi_id = x.id) AS prioritas_tertinggi,
       EXISTS (SELECT 1 FROM public.master_usulan u
               WHERE u.sumber_modul = 'inspeksi_gardu' AND u.sumber_id = x.id AND u.status = 'menunggu') AS tertahan
FROM public.inspeksi_gardu x
-- Kode & ULP disalin persis dari master: join biasa (hash join sekali),
-- bukan fungsi per baris yang memindai seluruh gardu dengan upper().
LEFT JOIN public.gardu g ON g.kode = x.gardu_kode AND g.ulp = x.ulp
LEFT JOIN public.wo_igardu_item i ON i.id = x.wo_item_id
LEFT JOIN public.wo_igardu w ON w.id = i.wo_id;

-- ★ Perlu Perbaikan: baris pemeliharaan (SAMA PERSIS dengan hargardu-view.sql)
-- + temuan Inspeksi Gardu yang masih terbuka. Kolom baru di BELAKANG.
-- Temuan hilang bila: admin menandai Selesai, kunjungannya dibatalkan /
-- dikembalikan, atau pemeliharaan SESUDAH tanggal temuan mencatat item
-- padanannya normal.
CREATE OR REPLACE VIEW public.gardu_perlu_perbaikan AS
SELECT
  k.gardu_kode,
  k.ulp,
  g.nama    AS gardu_nama,
  g.alamat  AS gardu_alamat,
  g.feeder  AS penyulang,
  k.item_kode,
  k.item_nama,
  k.kelompok,
  k.bagian,
  k.nilai,
  k.nilai_label,
  k.catatan,
  k.tgl_selesai AS ditemukan_pada,
  k.pemeliharaan_id,
  m.pr_keterangan,
  m.catatan_perbaikan,
  (tl.wo_item_id IS NOT NULL) AS sudah_di_wo,
  tl.wo_item_id,
  tl.ditugaskan_pada,
  'pemeliharaan'::text AS sumber,
  NULL::uuid           AS temuan_id
FROM public.gardu_kondisi_terakhir k
JOIN public.pemeliharaan_gardu m ON m.id = k.pemeliharaan_id
LEFT JOIN public.gardu g
  ON upper(g.kode) = upper(k.gardu_kode) AND upper(g.ulp) = upper(k.ulp)
LEFT JOIN public.tindak_lanjut_gardu tl
  ON upper(tl.gardu_kode) = upper(k.gardu_kode)
 AND upper(tl.ulp) = upper(k.ulp)
 AND tl.item_kode = k.item_kode
 AND tl.bagian = k.bagian
WHERE NOT k.normal
UNION ALL
SELECT
  x.gardu_kode,
  x.ulp,
  g.nama,
  g.alamat,
  COALESCE(g.feeder, x.penyulang),
  r.item_kode,
  ir.nama,
  ir.kelompok,
  -- Unik per gardu+item: satu kategori sekali per kunjungan, satu kunjungan
  -- per tier per bulan.
  format('Inspeksi T%s %s', x.tier, to_char(x.tgl AT TIME ZONE 'Asia/Makassar', 'DD-MM-YY')),
  t.prioritas,
  t.prioritas || ': ' || r.label,
  t.uraian,
  x.tgl,
  NULL::uuid,
  NULL::text,
  NULL::text,
  (tl.wo_item_id IS NOT NULL),
  tl.wo_item_id,
  tl.ditugaskan_pada,
  'inspeksi_gardu'::text,
  t.id
FROM public.inspeksi_gardu_temuan t
JOIN public.inspeksi_gardu x ON x.id = t.inspeksi_id
JOIN public.igardu_ref r ON r.kode = t.kategori
JOIN public.hargardu_item_ref ir ON ir.kode = r.item_kode
LEFT JOIN public.gardu g
  ON upper(g.kode) = upper(x.gardu_kode) AND upper(g.ulp) = upper(x.ulp)
LEFT JOIN public.tindak_lanjut_gardu tl
  ON upper(tl.gardu_kode) = upper(x.gardu_kode)
 AND upper(tl.ulp) = upper(x.ulp)
 AND tl.item_kode = r.item_kode
 AND tl.bagian = format('Inspeksi T%s %s', x.tier, to_char(x.tgl AT TIME ZONE 'Asia/Makassar', 'DD-MM-YY'))
WHERE t.status_tl = 'Terbuka'
  AND x.status IN ('Selesai', 'Diverifikasi')
  -- Langsung ke tabel (terindeks), bukan lewat gardu_kondisi_terakhir yang
  -- menghitung ulang DISTINCT ON seluruh pemeliharaan per baris. Kode & ULP
  -- sama-sama disalin dari master, jadi pembanding persis.
  AND NOT EXISTS (
    SELECT 1 FROM public.pemeliharaan_gardu pg
    WHERE pg.gardu_kode = x.gardu_kode AND pg.ulp = x.ulp
      AND pg.status = 'Diverifikasi' AND pg.tgl_selesai > x.tgl
      AND EXISTS (SELECT 1 FROM public.pemeliharaan_gardu_periksa p
                  WHERE p.pemeliharaan_id = pg.id AND p.item_kode = r.item_kode)
      AND NOT EXISTS (SELECT 1 FROM public.pemeliharaan_gardu_periksa p
                      LEFT JOIN public.hargardu_opsi_ref o ON o.item_kode = p.item_kode AND o.kode = p.nilai
                      WHERE p.pemeliharaan_id = pg.id AND p.item_kode = r.item_kode
                        AND NOT COALESCE(o.normal, true)));


-- ── 8. Regu: kolom igardu (menu HP 'inspeksiGardu') ──────────────────────────
-- Kolom lama tetap di urutan yang sama; layar JTM/JTR menyaring .eq(jtm|jtr).
CREATE OR REPLACE VIEW public.regu_inspeksi AS
SELECT p.nama AS regu,
       upper(p.ulp) AS ulp,
       p.group_name,
       to_jsonb(r.menus) ? 'jtm' AS jtm,
       to_jsonb(r.menus) ? 'jtr' AS jtr,
       to_jsonb(r.menus) ? 'inspeksiGardu' AS igardu
FROM public.petugas p
JOIN public.roles r ON upper(r.code) = upper(p.group_name)
WHERE lower(COALESCE(p.status, 'aktif')) = 'aktif'
  AND to_jsonb(r.menus) ?| ARRAY['jtm', 'jtr', 'inspeksiGardu']
  AND upper(r.code) NOT IN ('UP3', 'ADMIN');


-- ── 9. Hak akses ─────────────────────────────────────────────────────────────
-- Baca langsung; tulis HANYA lewat RPC di atas.
ALTER TABLE public.igardu_ref            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_igardu             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_igardu_item        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspeksi_gardu        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspeksi_gardu_temuan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS baca_igardu_ref ON public.igardu_ref;
CREATE POLICY baca_igardu_ref ON public.igardu_ref FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS baca_wo_igardu ON public.wo_igardu;
CREATE POLICY baca_wo_igardu ON public.wo_igardu FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS baca_wo_igardu_item ON public.wo_igardu_item;
CREATE POLICY baca_wo_igardu_item ON public.wo_igardu_item FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS baca_inspeksi_gardu ON public.inspeksi_gardu;
CREATE POLICY baca_inspeksi_gardu ON public.inspeksi_gardu FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS baca_inspeksi_gardu_temuan ON public.inspeksi_gardu_temuan;
CREATE POLICY baca_inspeksi_gardu_temuan ON public.inspeksi_gardu_temuan FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.igardu_ref, public.wo_igardu, public.wo_igardu_item,
                public.inspeksi_gardu, public.inspeksi_gardu_temuan TO authenticated;
GRANT SELECT ON public.wo_igardu_item_status, public.wo_igardu_capaian, public.inspeksi_gardu_daftar,
                public.gardu_perlu_perbaikan, public.regu_inspeksi TO authenticated;

-- Fungsi pembantu (_*) tidak dipanggil dari luar.
REVOKE ALL ON FUNCTION public._igardu_isi_wo(UUID, TEXT[], JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._igardu_master(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public._igardu_item_dikerjakan(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terbitkan_wo_igardu(TEXT, TEXT, INT, TEXT[], DATE, JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tambah_wo_igardu(UUID, TEXT[], JSONB, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tugaskan_regu_igardu(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.keluarkan_wo_igardu(UUID[], TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_wo_igardu(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kirim_inspeksi_gardu(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verifikasi_inspeksi_gardu(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kembalikan_inspeksi_gardu(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_inspeksi_gardu(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.selesaikan_temuan_igardu(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
