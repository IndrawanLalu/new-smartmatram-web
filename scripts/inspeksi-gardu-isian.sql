-- =============================================================================
-- Inspeksi Gardu Tier 1 — ISIAN LENGKAP (10 Nov 2026). Rencana:
-- rencana-inspeksi-gardu-isian.md. Jalankan SESUDAH inspeksi-gardu.sql,
-- jam-tier2.sql, dan hargardu-temuan-wo.sql. Idempoten.
--
-- Keputusan user 10 Nov:
--   1. Tier 1 saja (Tier 2 tetap temuan + suhu thermal).
--   2. Daftar "tidak normal = temuan" sesuai usulan, bisa diubah di Pengaturan.
--   3. Satu item satu foto (item berfoto: fotonya wajib, juga saat baik).
--   4. Pengukuran tegangan & arus cukup tersimpan di inspeksi.
--   5. Grounding: temuan HANYA bila "Tidak ada grounding" (angka tidak dinilai).
--   6. Isian mulai KOSONG.
--   7. Tidak memperbarui master gardu — tapi ada sakelar untuk nanti
--      (igardu_pengaturan.perbarui_master + kolom_master per item).
--
-- Keputusan teknis:
--   • Katalog di database (igardu_isian_ref + igardu_isian_opsi), diatur di
--     web — item & pilihan baru tanpa rilis aplikasi (pola JTM).
--   • Jawaban: inspeksi_gardu_isian (satu baris per item × rincian; rincian
--     = '-' / 'R-0' / 'A:R' untuk per jurusan).
--   • Temuan DITURUNKAN server dari jawaban tidak normal → baris
--     inspeksi_gardu_temuan berkategori 'isian' + isian_item. Jadi Perlu
--     Perbaikan, Jadikan WO, WO Perbaikan, foto riwayat — semua yang membaca
--     inspeksi_gardu_temuan — ikut tanpa diubah satu per satu.
--   • Kirim = SATU RPC baru `kirim_inspeksi_gardu_isi` yang memanggil
--     kirim_inspeksi_gardu (definisi hidup, sudah ditambal jam-tier2.sql)
--     lalu menyimpan isian dalam transaksi yang sama. HP lama yang masih
--     memanggil kirim_inspeksi_gardu tetap jalan (tanpa isian).
--   • Semua UPDATE/DELETE ber-WHERE (safeupdate Supabase).
-- =============================================================================


-- ── 1. Katalog isian ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.igardu_isian_ref (
  kode         TEXT PRIMARY KEY,            -- TETAP (tertulis di jawaban)
  bagian       TEXT NOT NULL,               -- judul halaman di HP
  nama         TEXT NOT NULL,
  tipe         TEXT NOT NULL DEFAULT 'pilihan',
  satuan       TEXT,
  rincian      TEXT[] NOT NULL DEFAULT '{}', -- kosong = satu isian; mis. {R,S,T,N}
  per_jurusan  BOOLEAN NOT NULL DEFAULT false,
  foto         BOOLEAN NOT NULL DEFAULT false,
  wajib        BOOLEAN NOT NULL DEFAULT true,
  -- Item Pemeliharaan Gardu tujuan temuannya (Perlu Perbaikan & Jadikan WO).
  item_tl      TEXT REFERENCES public.hargardu_item_ref (kode),
  -- Kolom master `gardu` yang diperbarui bila sakelar perbarui_master hidup.
  kolom_master TEXT,
  urutan       INT     NOT NULL DEFAULT 100,
  aktif        BOOLEAN NOT NULL DEFAULT true,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT igardu_isian_tipe_valid CHECK (tipe IN ('pilihan', 'angka', 'tahanan'))
);

CREATE TABLE IF NOT EXISTS public.igardu_isian_opsi (
  item_kode TEXT NOT NULL REFERENCES public.igardu_isian_ref (kode) ON DELETE CASCADE,
  kode      TEXT NOT NULL,
  label     TEXT NOT NULL,
  normal    BOOLEAN NOT NULL DEFAULT true,
  prioritas TEXT NOT NULL DEFAULT 'Biasa',  -- prioritas temuannya bila tidak normal
  urutan    INT     NOT NULL DEFAULT 100,
  aktif     BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (item_kode, kode),
  CONSTRAINT igardu_opsi_prioritas_valid CHECK (prioritas IN ('Urgent', 'Rawan', 'Biasa'))
);

CREATE TABLE IF NOT EXISTS public.igardu_pengaturan (
  id              INT PRIMARY KEY DEFAULT 1,
  perbarui_master BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_oleh    TEXT,
  CONSTRAINT igardu_pengaturan_satu CHECK (id = 1)
);
INSERT INTO public.igardu_pengaturan (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Isian awal = draf user 10 Nov. Disunting dari Pengaturan; ON CONFLICT DO
-- NOTHING supaya menjalankan ulang tidak menimpa suntingan.
INSERT INTO public.igardu_isian_ref (kode, bagian, nama, tipe, satuan, rincian, per_jurusan, foto, item_tl, urutan) VALUES
  ('kebersihan_gardu', 'Kebersihan',    'Kebersihan gardu',       'pilihan', NULL, '{}', false, true,  'temuan_lain',            10),
  ('kebersihan_luar',  'Kebersihan',    'Kebersihan luar gardu',  'pilihan', NULL, '{}', false, false, 'temuan_lain',            20),
  ('arrester',         'Arrester',      'Arrester',               'pilihan', NULL, '{}', false, true,  'arrester',               30),
  ('lvsb_kondisi',     'LVSB',          'Kondisi LVSB trafo',     'pilihan', NULL, '{}', false, true,  'lv_board',               40),
  ('dudukan_fuse',     'LVSB',          'Dudukan fuse',           'pilihan', NULL, '{}', false, false, 'dudukan_fuse',           50),
  ('inlet_kondisi',    'Inlet / Outlet','Kondisi inlet',          'pilihan', NULL, '{}', false, false, 'kabel_inlet',            60),
  ('inlet_ukuran',     'Inlet / Outlet','Ukuran inlet',           'pilihan', NULL, '{}', false, false, 'kabel_inlet',            70),
  ('outlet_kondisi',   'Inlet / Outlet','Kondisi outlet',         'pilihan', NULL, '{}', false, false, 'kabel_outlet',           80),
  ('outlet_ukuran',    'Inlet / Outlet','Ukuran outlet',          'pilihan', NULL, '{}', false, false, 'kabel_outlet',           90),
  ('grd_netral',       'Grounding',     'Tahanan netral trafo',   'tahanan', 'Ω',  '{}', false, false, 'pentanahan_jenis_kabel', 100),
  ('grd_arrester',     'Grounding',     'Tahanan arrester',       'tahanan', 'Ω',  '{}', false, false, 'pentanahan_jenis_kabel', 110),
  ('grd_lvboard',      'Grounding',     'Tahanan LV board',       'tahanan', 'Ω',  '{}', false, false, 'pentanahan_jenis_kabel', 120),
  ('grd_body',         'Grounding',     'Tahanan body trafo',     'tahanan', 'Ω',  '{}', false, false, 'pentanahan_jenis_kabel', 130),
  ('trafo_bocor',      'Trafo',         'Kebocoran minyak',       'pilihan', NULL, '{}', false, true,  'minyak_trafo',           140),
  ('trafo_fisik',      'Trafo',         'Kondisi fisik trafo',    'pilihan', NULL, '{}', false, true,  'kondisi_trafo',          150),
  ('fco',              'FCO',           'Fuse cut out',           'pilihan', NULL, '{}', false, true,  'cut_out',                160),
  ('ukur_tegangan',    'Pengukuran',    'Tegangan',               'angka',   'V',  '{R-0,S-0,T-0,R-S,R-T,S-T}', false, false, NULL, 170),
  ('ukur_arus',        'Pengukuran',    'Arus utama',             'angka',   'A',  '{R,S,T,N}', false, false, NULL, 180),
  ('ukur_arus_jurusan','Pengukuran',    'Arus jurusan',           'angka',   'A',  '{R,S,T,N}', true,  false, NULL, 190),
  ('nh_fuse',          'NH fuse',       'Rating NH fuse',         'angka',   'A',  '{R,S,T}',   true,  false, NULL, 200)
ON CONFLICT (kode) DO NOTHING;

INSERT INTO public.igardu_isian_opsi (item_kode, kode, label, normal, urutan) VALUES
  ('kebersihan_gardu', 'bersih', 'Bersih', true, 1),
  ('kebersihan_gardu', 'kotor',  'Kotor',  false, 2),
  ('kebersihan_luar',  'bersih', 'Bersih', true, 1),
  ('kebersihan_luar',  'kotor',  'Kotor',  false, 2),
  ('arrester', 'baik',      'Fisik & konstruksi baik', true, 1),
  ('arrester', 'perbaikan', 'Diperlukan perbaikan',    false, 2),
  ('arrester', 'ganti',     'Diperlukan penggantian',  false, 3),
  ('lvsb_kondisi', 'bersih_rapi',  'Box bersih, instalasi rapi',  true, 1),
  ('lvsb_kondisi', 'kotor_rapi',   'Box kotor, instalasi rapi',   false, 2),
  ('lvsb_kondisi', 'karatan_rapi', 'Box karatan, instalasi rapi', false, 3),
  ('lvsb_kondisi', 'bocor_buruk',  'Box bocor, instalasi buruk',  false, 4),
  ('lvsb_kondisi', 'pintu_rusak',  'Pintu box rusak',             false, 5),
  ('lvsb_kondisi', 'tidak_ada',    'Box tidak ada',               false, 6),
  ('dudukan_fuse', 'sesuai',       'Ada, sesuai standar',       true, 1),
  ('dudukan_fuse', 'tidak_sesuai', 'Ada, tidak sesuai standar', false, 2),
  ('dudukan_fuse', 'buruk',        'Ada, kondisi buruk',        false, 3),
  ('dudukan_fuse', 'tidak_ada',    'Tidak ada',                 false, 4),
  ('inlet_kondisi', 'sesuai',       'Ada, sesuai standar',       true, 1),
  ('inlet_kondisi', 'tidak_sesuai', 'Ada, tidak sesuai standar', false, 2),
  ('inlet_kondisi', 'buruk',        'Ada, kondisi buruk',        false, 3),
  ('outlet_kondisi', 'sesuai',       'Ada, sesuai standar',       true, 1),
  ('outlet_kondisi', 'tidak_sesuai', 'Ada, tidak sesuai standar', false, 2),
  ('outlet_kondisi', 'buruk',        'Ada, kondisi buruk',        false, 3),
  ('inlet_ukuran',  'nyy70', 'NYY 70', true, 1),
  ('inlet_ukuran',  'nyy95', 'NYY 95', true, 2),
  ('inlet_ukuran',  'lvtc',  'LVTC',   true, 3),
  ('outlet_ukuran', 'nyy70', 'NYY 70', true, 1),
  ('outlet_ukuran', 'nyy95', 'NYY 95', true, 2),
  ('outlet_ukuran', 'lvtc',  'LVTC',   true, 3),
  -- Grounding: angka Ω, atau satu-satunya pilihan "Tidak ada grounding" = temuan.
  ('grd_netral',   'tidak_ada', 'Tidak ada grounding', false, 1),
  ('grd_arrester', 'tidak_ada', 'Tidak ada grounding', false, 1),
  ('grd_lvboard',  'tidak_ada', 'Tidak ada grounding', false, 1),
  ('grd_body',     'tidak_ada', 'Tidak ada grounding', false, 1),
  ('trafo_bocor', 'bersih',               'Bersih',                    true, 1),
  ('trafo_bocor', 'packing_retak',        'Packing retak',             false, 2),
  ('trafo_bocor', 'packing_retak_minyak', 'Packing retak & berminyak', false, 3),
  ('trafo_bocor', 'rembes',               'Rembes / tetes',            false, 4),
  ('trafo_fisik', 'mulus',       'Mulus',             true, 1),
  ('trafo_fisik', 'bengkak',     'Bengkak',           false, 2),
  ('trafo_fisik', 'sirip_mayor', 'Cacat sirip mayor', false, 3),
  ('trafo_fisik', 'sirip_minor', 'Cacat sirip minor', false, 4),
  ('fco', 'baik',      'Fisik & konstruksi baik', true, 1),
  ('fco', 'perbaikan', 'Diperlukan perbaikan',    false, 2),
  ('fco', 'ganti',     'Diperlukan penggantian',  false, 3)
ON CONFLICT (item_kode, kode) DO NOTHING;


-- ── 2. Jawaban + temuan turunan ──────────────────────────────────────────────
ALTER TABLE public.inspeksi_gardu
  ADD COLUMN IF NOT EXISTS isian          BOOLEAN NOT NULL DEFAULT false,  -- dikirim dengan isian lengkap
  ADD COLUMN IF NOT EXISTS jumlah_jurusan INT;

CREATE TABLE IF NOT EXISTS public.inspeksi_gardu_isian (
  inspeksi_id UUID NOT NULL REFERENCES public.inspeksi_gardu (id) ON DELETE CASCADE,
  item_kode   TEXT NOT NULL REFERENCES public.igardu_isian_ref (kode),
  rincian     TEXT NOT NULL DEFAULT '-',
  nilai       TEXT,              -- kode pilihan ('tidak_ada' untuk grounding)
  angka       NUMERIC,
  foto_url    TEXT,
  catatan     TEXT,
  PRIMARY KEY (inspeksi_id, item_kode, rincian)
);

-- Temuan turunan isian: kategori 'isian' (tersembunyi) + isian_item.
INSERT INTO public.hargardu_item_ref (kode, nama, kelompok, dimensi, tipe, wajib, urutan, aktif, tampil_dashboard, keterangan)
VALUES ('isian_igardu', 'Isian Inspeksi Gardu', 'Lainnya', 'tunggal', 'pilihan', false, 998, false, false,
        'JANGAN DIAKTIFKAN. Penampung kategori temuan turunan isian Inspeksi Gardu (item tujuannya diatur per isian).')
ON CONFLICT (kode) DO NOTHING;
INSERT INTO public.igardu_ref (kode, label, item_kode, urutan, aktif)
VALUES ('isian', 'Isian inspeksi (otomatis — jangan diaktifkan)', 'isian_igardu', 998, false)
ON CONFLICT (kode) DO NOTHING;

ALTER TABLE public.inspeksi_gardu_temuan
  ADD COLUMN IF NOT EXISTS isian_item TEXT REFERENCES public.igardu_isian_ref (kode);
-- Satu kategori sekali per kunjungan berlaku untuk temuan MANUAL saja; temuan
-- isian unik per item isian.
ALTER TABLE public.inspeksi_gardu_temuan DROP CONSTRAINT IF EXISTS igardu_temuan_kategori_unik;
CREATE UNIQUE INDEX IF NOT EXISTS igardu_temuan_kategori_unik_manual
  ON public.inspeksi_gardu_temuan (inspeksi_id, kategori) WHERE isian_item IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS igardu_temuan_isian_unik
  ON public.inspeksi_gardu_temuan (inspeksi_id, isian_item) WHERE isian_item IS NOT NULL;


-- ── 3. Kirim (HP) ────────────────────────────────────────────────────────────
-- p_isi = kiriman kirim_inspeksi_gardu + isian: [{item, rincian, nilai, angka,
-- foto, catatan}] + jumlah_jurusan. Tier 2 / tanpa isian → diteruskan apa adanya.
CREATE OR REPLACE FUNCTION public.kirim_inspeksi_gardu_isi(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_isian JSONB := p_isi->'isian';
  v_jur   INT   := NULLIF(p_isi->>'jumlah_jurusan', '')::int;
  h       JSONB;
  v_id    UUID;
  it      public.igardu_isian_ref;
  x       JSONB;
  r       TEXT;
  j       TEXT;
  kunci   TEXT[];
  n_tem   INT;
BEGIN
  IF COALESCE(p_isi->>'tier', '') <> '1' OR jsonb_typeof(v_isian) IS DISTINCT FROM 'array' THEN
    RETURN public.kirim_inspeksi_gardu(p_isi);
  END IF;

  -- Periksa isian DULU — kunjungan tidak tersimpan setengah.
  FOR x IN SELECT * FROM jsonb_array_elements(v_isian) LOOP
    SELECT * INTO it FROM public.igardu_isian_ref WHERE kode = x->>'item';
    IF NOT FOUND THEN RAISE EXCEPTION 'Isian "%" tidak dikenal — perbarui daftar isian (tarik daftar ke bawah).', x->>'item'; END IF;
    IF it.tipe IN ('pilihan', 'tahanan') AND NULLIF(x->>'nilai', '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.igardu_isian_opsi o WHERE o.item_kode = it.kode AND o.kode = x->>'nilai') THEN
      RAISE EXCEPTION 'Pilihan "%" untuk % tidak dikenal — perbarui daftar isian.', x->>'nilai', it.nama;
    END IF;
    IF COALESCE(x->>'foto', '') <> '' AND x->>'foto' NOT LIKE 'http%' THEN
      RAISE EXCEPTION 'Foto % belum terunggah. Kirim ulang saat sinyal lebih baik.', it.nama;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.igardu_isian_ref WHERE aktif AND per_jurusan) AND COALESCE(v_jur, 0) NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'Jumlah jurusan gardu belum diisi (1–4).';
  END IF;

  -- Kelengkapan: tiap isian aktif yang wajib, tiap rincian (× jurusan).
  kunci := ARRAY(SELECT (e->>'item') || '|' || COALESCE(NULLIF(e->>'rincian', ''), '-')
                 FROM jsonb_array_elements(v_isian) e
                 WHERE NULLIF(e->>'nilai', '') IS NOT NULL OR NULLIF(e->>'angka', '') IS NOT NULL);
  FOR it IN SELECT * FROM public.igardu_isian_ref WHERE aktif AND wajib ORDER BY urutan LOOP
    IF cardinality(it.rincian) = 0 THEN
      IF NOT (it.kode || '|-') = ANY (kunci) THEN RAISE EXCEPTION '% belum diisi.', it.nama; END IF;
    ELSE
      FOREACH r IN ARRAY it.rincian LOOP
        IF it.per_jurusan THEN
          FOREACH j IN ARRAY (ARRAY['A', 'B', 'C', 'D'])[1:v_jur] LOOP
            IF NOT (it.kode || '|' || j || ':' || r) = ANY (kunci) THEN
              RAISE EXCEPTION '% jurusan % fasa % belum diisi.', it.nama, j, r;
            END IF;
          END LOOP;
        ELSIF NOT (it.kode || '|' || r) = ANY (kunci) THEN
          RAISE EXCEPTION '% % belum diisi.', it.nama, r;
        END IF;
      END LOOP;
    END IF;
    IF it.foto AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_isian) e
                               WHERE e->>'item' = it.kode AND e->>'foto' LIKE 'http%') THEN
      RAISE EXCEPTION 'Foto % wajib.', it.nama;
    END IF;
  END LOOP;

  h := public.kirim_inspeksi_gardu(p_isi);
  IF COALESCE((h->>'sudah_ada')::boolean, false) THEN RETURN h; END IF;
  v_id := (h->>'id')::uuid;

  DELETE FROM public.inspeksi_gardu_isian WHERE inspeksi_id = v_id;
  INSERT INTO public.inspeksi_gardu_isian (inspeksi_id, item_kode, rincian, nilai, angka, foto_url, catatan)
  SELECT DISTINCT ON (e->>'item', COALESCE(NULLIF(e->>'rincian', ''), '-'))
         v_id, e->>'item', COALESCE(NULLIF(e->>'rincian', ''), '-'), NULLIF(e->>'nilai', ''),
         NULLIF(replace(e->>'angka', ',', '.'), '')::numeric, NULLIF(e->>'foto', ''), NULLIF(btrim(COALESCE(e->>'catatan', '')), '')
  FROM jsonb_array_elements(v_isian) e;

  -- Temuan turunan: jawaban pilihan yang TIDAK NORMAL (kirim_inspeksi_gardu
  -- sudah menghapus temuan lama dan menyisipkan temuan manual).
  INSERT INTO public.inspeksi_gardu_temuan (inspeksi_id, urutan, kategori, isian_item, uraian, prioritas, foto_url)
  SELECT v_id, 100 + row_number() OVER (ORDER BY i.urutan), 'isian', i.kode,
         o.label || COALESCE(' · ' || a.catatan, ''), o.prioritas,
         CASE WHEN a.foto_url IS NULL THEN '{}'::text[] ELSE ARRAY[a.foto_url] END
  FROM public.inspeksi_gardu_isian a
  JOIN public.igardu_isian_ref i ON i.kode = a.item_kode
  JOIN public.igardu_isian_opsi o ON o.item_kode = a.item_kode AND o.kode = a.nilai AND NOT o.normal
  WHERE a.inspeksi_id = v_id AND a.rincian = '-';
  GET DIAGNOSTICS n_tem = ROW_COUNT;

  UPDATE public.inspeksi_gardu
  SET isian = true, jumlah_jurusan = v_jur,
      ada_temuan = EXISTS (SELECT 1 FROM public.inspeksi_gardu_temuan t WHERE t.inspeksi_id = v_id)
  WHERE id = v_id;

  RETURN h || jsonb_build_object('temuan', COALESCE((h->>'temuan')::int, 0) + n_tem, 'temuan_isian', n_tem);
END $fn$;
REVOKE ALL ON FUNCTION public.kirim_inspeksi_gardu_isi(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kirim_inspeksi_gardu_isi(JSONB) TO authenticated;


-- ── 4. Pengaturan (web, UP3 / admin) ─────────────────────────────────────────
-- p_item: {kode, bagian, nama, tipe, satuan, rincian[], per_jurusan, foto,
--          wajib, item_tl, kolom_master, urutan, aktif}
-- p_opsi: [{kode, label, normal, prioritas, urutan, aktif}] — pilihan yang
-- tidak dikirim DINONAKTIFKAN (jawaban lama tetap terbaca), tidak dihapus.
CREATE OR REPLACE FUNCTION public.simpan_igardu_isian(p_item JSONB, p_opsi JSONB, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role TEXT;
  v_kode TEXT := lower(btrim(COALESCE(p_item->>'kode', '')));
  v_tipe TEXT := COALESCE(p_item->>'tipe', 'pilihan');
  v_kol  TEXT := NULLIF(btrim(COALESCE(p_item->>'kolom_master', '')), '');
  lama   public.igardu_isian_ref;
  o      JSONB;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = auth.uid();
  IF COALESCE(v_role, '') NOT IN ('UP3', 'admin') THEN
    RAISE EXCEPTION 'Hanya UP3 atau admin ULP yang boleh mengubah isian Inspeksi Gardu.';
  END IF;
  IF v_kode !~ '^[a-z0-9_]{2,30}$' THEN
    RAISE EXCEPTION 'Kode isian hanya huruf kecil, angka, dan garis bawah (2–30 huruf).';
  END IF;
  IF btrim(COALESCE(p_item->>'nama', '')) = '' OR btrim(COALESCE(p_item->>'bagian', '')) = '' THEN
    RAISE EXCEPTION 'Nama isian dan bagiannya wajib diisi.';
  END IF;
  IF v_tipe NOT IN ('pilihan', 'angka', 'tahanan') THEN RAISE EXCEPTION 'Tipe isian tidak dikenal.'; END IF;
  IF NULLIF(p_item->>'item_tl', '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.hargardu_item_ref WHERE kode = p_item->>'item_tl') THEN
    RAISE EXCEPTION 'Item Pemeliharaan Gardu "%" tidak ada.', p_item->>'item_tl';
  END IF;
  IF v_kol IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'gardu' AND column_name = v_kol
         AND column_name NOT IN ('id', 'kode', 'ulp', 'lat', 'lng', 'created_at', 'updated_at')) THEN
    RAISE EXCEPTION 'Kolom master gardu "%" tidak ada (atau tidak boleh diubah dari inspeksi).', v_kol;
  END IF;

  SELECT * INTO lama FROM public.igardu_isian_ref WHERE kode = v_kode FOR UPDATE;
  IF lama.kode IS NOT NULL AND lama.tipe <> v_tipe
     AND EXISTS (SELECT 1 FROM public.inspeksi_gardu_isian WHERE item_kode = v_kode) THEN
    RAISE EXCEPTION 'Tipe isian "%" tidak bisa diubah: sudah ada jawabannya. Buat isian baru, nonaktifkan yang lama.', lama.nama;
  END IF;

  INSERT INTO public.igardu_isian_ref (kode, bagian, nama, tipe, satuan, rincian, per_jurusan, foto, wajib, item_tl, kolom_master, urutan, aktif, updated_at)
  VALUES (v_kode, btrim(p_item->>'bagian'), btrim(p_item->>'nama'), v_tipe, NULLIF(btrim(COALESCE(p_item->>'satuan', '')), ''),
          COALESCE(ARRAY(SELECT btrim(v) FROM jsonb_array_elements_text(COALESCE(p_item->'rincian', '[]'::jsonb)) v WHERE btrim(v) <> ''), '{}'),
          COALESCE((p_item->>'per_jurusan')::boolean, false), COALESCE((p_item->>'foto')::boolean, false),
          COALESCE((p_item->>'wajib')::boolean, true), NULLIF(p_item->>'item_tl', ''), v_kol,
          COALESCE(NULLIF(p_item->>'urutan', '')::int, 100), COALESCE((p_item->>'aktif')::boolean, true), now())
  ON CONFLICT (kode) DO UPDATE SET
    bagian = EXCLUDED.bagian, nama = EXCLUDED.nama, tipe = EXCLUDED.tipe, satuan = EXCLUDED.satuan,
    rincian = EXCLUDED.rincian, per_jurusan = EXCLUDED.per_jurusan, foto = EXCLUDED.foto, wajib = EXCLUDED.wajib,
    item_tl = EXCLUDED.item_tl, kolom_master = EXCLUDED.kolom_master, urutan = EXCLUDED.urutan,
    aktif = EXCLUDED.aktif, updated_at = now();

  IF jsonb_typeof(p_opsi) = 'array' THEN
    FOR o IN SELECT * FROM jsonb_array_elements(p_opsi) LOOP
      IF lower(btrim(COALESCE(o->>'kode', ''))) !~ '^[a-z0-9_]{1,30}$' OR btrim(COALESCE(o->>'label', '')) = '' THEN
        RAISE EXCEPTION 'Setiap pilihan perlu kode (huruf kecil/angka/_) dan nama.';
      END IF;
      IF COALESCE(o->>'prioritas', 'Biasa') NOT IN ('Urgent', 'Rawan', 'Biasa') THEN
        RAISE EXCEPTION 'Prioritas pilihan harus Urgent, Rawan, atau Biasa.';
      END IF;
      INSERT INTO public.igardu_isian_opsi (item_kode, kode, label, normal, prioritas, urutan, aktif)
      VALUES (v_kode, lower(btrim(o->>'kode')), btrim(o->>'label'), COALESCE((o->>'normal')::boolean, true),
              COALESCE(o->>'prioritas', 'Biasa'), COALESCE(NULLIF(o->>'urutan', '')::int, 100), COALESCE((o->>'aktif')::boolean, true))
      ON CONFLICT (item_kode, kode) DO UPDATE SET
        label = EXCLUDED.label, normal = EXCLUDED.normal, prioritas = EXCLUDED.prioritas,
        urutan = EXCLUDED.urutan, aktif = EXCLUDED.aktif;
    END LOOP;
    UPDATE public.igardu_isian_opsi SET aktif = false
    WHERE item_kode = v_kode
      AND kode NOT IN (SELECT lower(btrim(e->>'kode')) FROM jsonb_array_elements(p_opsi) e);
  END IF;

  INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  -- ulp NOT NULL di master_audit; katalog berlaku semua ULP → '-' (pola batalkan-inspeksi.sql).
  VALUES ('igardu_isian_ref', v_kode, '-', CASE WHEN lama.kode IS NULL THEN 'tambah' ELSE 'ubah' END,
          CASE WHEN lama.kode IS NULL THEN NULL ELSE to_jsonb(lama) END, p_item || jsonb_build_object('opsi', p_opsi),
          'sunting_admin', auth.uid(), p_oleh);
END $fn$;
REVOKE ALL ON FUNCTION public.simpan_igardu_isian(JSONB, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simpan_igardu_isian(JSONB, JSONB, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.simpan_igardu_pengaturan(p_perbarui_master BOOLEAN, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'UP3') THEN
    RAISE EXCEPTION 'Hanya UP3 yang boleh mengubah sakelar ini (berlaku untuk semua ULP).';
  END IF;
  UPDATE public.igardu_pengaturan SET perbarui_master = COALESCE(p_perbarui_master, false), updated_at = now(), updated_oleh = p_oleh
  WHERE id = 1;
END $fn$;
REVOKE ALL ON FUNCTION public.simpan_igardu_pengaturan(BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simpan_igardu_pengaturan(BOOLEAN, TEXT) TO authenticated;


-- ── 5. Sakelar master: disetujui → kolom master gardu diperbarui ────────────
-- Hanya bila igardu_pengaturan.perbarui_master HIDUP dan isiannya punya
-- kolom_master (keduanya mati/kosong sekarang — keputusan user 10 Nov).
CREATE OR REPLACE FUNCTION public.igardu_isian_ke_master()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  a RECORD;
BEGIN
  IF NOT COALESCE((SELECT perbarui_master FROM public.igardu_pengaturan WHERE id = 1), false) THEN RETURN NEW; END IF;
  FOR a IN
    SELECT i.kolom_master, COALESCE(o.label, a0.angka::text) AS nilai
    FROM public.inspeksi_gardu_isian a0
    JOIN public.igardu_isian_ref i ON i.kode = a0.item_kode AND i.kolom_master IS NOT NULL
    LEFT JOIN public.igardu_isian_opsi o ON o.item_kode = a0.item_kode AND o.kode = a0.nilai
    WHERE a0.inspeksi_id = NEW.id AND a0.rincian = '-' AND COALESCE(a0.nilai, '') <> 'tidak_ada'
  LOOP
    IF a.nilai IS NULL OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                                      WHERE table_schema = 'public' AND table_name = 'gardu' AND column_name = a.kolom_master) THEN
      CONTINUE;
    END IF;
    EXECUTE format('UPDATE public.gardu SET %I = $1, updated_at = now() WHERE kode = $2 AND ulp = $3', a.kolom_master)
      USING a.nilai, NEW.gardu_kode, NEW.ulp;
  END LOOP;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_igardu_isian_ke_master ON public.inspeksi_gardu;
CREATE TRIGGER trg_igardu_isian_ke_master AFTER UPDATE OF status ON public.inspeksi_gardu
  FOR EACH ROW WHEN (NEW.status = 'Diverifikasi' AND OLD.status IS DISTINCT FROM 'Diverifikasi')
  EXECUTE FUNCTION public.igardu_isian_ke_master();


-- ── 6. Hak baca ──────────────────────────────────────────────────────────────
ALTER TABLE public.igardu_isian_ref     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.igardu_isian_opsi    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.igardu_pengaturan    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspeksi_gardu_isian ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS baca ON public.igardu_isian_ref;
CREATE POLICY baca ON public.igardu_isian_ref FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS baca ON public.igardu_isian_opsi;
CREATE POLICY baca ON public.igardu_isian_opsi FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS baca ON public.igardu_pengaturan;
CREATE POLICY baca ON public.igardu_pengaturan FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS baca ON public.inspeksi_gardu_isian;
CREATE POLICY baca ON public.inspeksi_gardu_isian FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.igardu_isian_ref, public.igardu_isian_opsi, public.igardu_pengaturan,
                public.inspeksi_gardu_isian TO authenticated;


-- ── 7. Perlu Perbaikan: temuan isian ─────────────────────────────────────────
-- Sama dengan hargardu-temuan-wo.sql bagian 7, kecuali cabang Inspeksi Gardu:
-- item tujuan = item_tl isian (bukan item kategori), nama = nama isian, dan
-- bagian ber-akhiran nama isian (dua isian bisa menunjuk item yang sama).
CREATE OR REPLACE VIEW public.gardu_perlu_perbaikan AS
WITH terakhir AS MATERIALIZED (
  SELECT DISTINCT ON (upper(gardu_kode), upper(ulp))
         id, gardu_kode, ulp, tgl_selesai, pr_keterangan, catatan_perbaikan, petugas_nama
  FROM public.pemeliharaan_gardu
  WHERE status = 'Diverifikasi'
  ORDER BY upper(gardu_kode), upper(ulp), tgl_selesai DESC NULLS LAST, created_at DESC
), gd AS MATERIALIZED (
  SELECT DISTINCT ON (upper(kode), upper(ulp)) upper(kode) AS k, upper(ulp) AS u, nama, alamat, feeder
  FROM public.gardu
  ORDER BY upper(kode), upper(ulp), kode
), tl AS MATERIALIZED (
  SELECT *, upper(gardu_kode) AS k, upper(ulp) AS u FROM public.tindak_lanjut_gardu
)
SELECT
  t.gardu_kode,
  t.ulp,
  g.nama    AS gardu_nama,
  g.alamat  AS gardu_alamat,
  g.feeder  AS penyulang,
  p.item_kode,
  i.nama    AS item_nama,
  i.kelompok,
  p.bagian,
  p.nilai,
  o.label   AS nilai_label,
  p.catatan,
  t.tgl_selesai AS ditemukan_pada,
  t.id      AS pemeliharaan_id,
  t.pr_keterangan,
  t.catatan_perbaikan,
  (tl.id IS NOT NULL AND tl.status <> 'Dikerjakan') AS sudah_di_wo,
  tl.wo_item_id,
  tl.ditugaskan_pada,
  'pemeliharaan'::text AS sumber,
  NULL::uuid           AS temuan_id,
  -- ★ baru (hargardu-temuan-wo.sql)
  CASE WHEN tl.status = 'Dikerjakan' THEN NULL ELSE tl.status END AS tl_status,
  CASE WHEN tl.status = 'Dikerjakan' THEN NULL ELSE tl.jalur END  AS jalur,
  tl.perbaikan_id,
  tl.wo_har_item_id,
  -- Foto temuan Pemeliharaan Gardu = foto bagian itu di catatan yang sama
  -- (slot foto sekelompok dengan item, hargardu-acuan.sql); bagian tanpa slot
  -- sendiri (mis. Jumperan) -> foto "sebelum" pekerjaan.
  COALESCE(
    (SELECT f.url FROM public.pemeliharaan_gardu_foto f JOIN public.hargardu_foto_ref fr ON fr.kode = f.slot
     WHERE f.pemeliharaan_id = t.id AND fr.kelompok = i.kelompok ORDER BY fr.urutan LIMIT 1),
    (SELECT f.url FROM public.pemeliharaan_gardu_foto f WHERE f.pemeliharaan_id = t.id AND f.slot = 'sebelum')
  ) AS foto_url,
  NULL::text AS prioritas,
  t.petugas_nama,
  tl.hasil_catatan
FROM terakhir t
JOIN public.pemeliharaan_gardu_periksa p ON p.pemeliharaan_id = t.id
-- Hanya jawaban TIDAK NORMAL (sama dengan gardu_kondisi_terakhir WHERE NOT normal).
JOIN public.hargardu_opsi_ref o ON o.item_kode = p.item_kode AND o.kode = p.nilai AND NOT o.normal
JOIN public.hargardu_item_ref i ON i.kode = p.item_kode
LEFT JOIN gd g ON g.k = upper(t.gardu_kode) AND g.u = upper(t.ulp)
LEFT JOIN tl ON tl.k = upper(t.gardu_kode) AND tl.u = upper(t.ulp) AND tl.item_kode = p.item_kode AND tl.bagian = p.bagian
-- Dikerjakan lewat WO Perbaikan SESUDAH pemeliharaan terakhir -> keluar. Lewat
-- WO Pemeliharaan, pemeliharaan itu sendiri jadi "terakhir": kalau masih
-- mencatat tidak normal, itu temuan baru dan memang harus tampil lagi.
WHERE NOT COALESCE(tl.status = 'Dikerjakan' AND tl.jalur = 'perbaikan' AND tl.dikerjakan_at >= t.tgl_selesai, false)
UNION ALL
SELECT
  x.gardu_kode,
  x.ulp,
  g.nama,
  g.alamat,
  COALESCE(g.feeder, x.penyulang),
  COALESCE(ii.item_tl, r.item_kode),
  COALESCE(ii.nama, ir.nama),
  ir.kelompok,
  -- Unik per gardu+item: satu kategori sekali per kunjungan, satu kunjungan
  -- per tier per bulan.
  format('Inspeksi T%s %s', x.tier, to_char(x.tgl AT TIME ZONE 'Asia/Makassar', 'DD-MM-YY')) || CASE WHEN ii.kode IS NULL THEN '' ELSE ' · ' || ii.nama END,
  t.prioritas,
  t.prioritas || ': ' || CASE WHEN ii.kode IS NULL THEN r.label ELSE t.uraian END,
  t.uraian,
  x.tgl,
  NULL::uuid,
  NULL::text,
  NULL::text,
  (tl.id IS NOT NULL AND tl.status <> 'Dikerjakan'),
  tl.wo_item_id,
  tl.ditugaskan_pada,
  'inspeksi_gardu'::text,
  t.id,
  CASE WHEN tl.status = 'Dikerjakan' THEN NULL ELSE tl.status END,
  CASE WHEN tl.status = 'Dikerjakan' THEN NULL ELSE tl.jalur END,
  tl.perbaikan_id,
  tl.wo_har_item_id,
  t.foto_url[1] AS foto_url,
  t.prioritas,
  x.petugas_nama,
  tl.hasil_catatan
FROM public.inspeksi_gardu_temuan t
JOIN public.inspeksi_gardu x ON x.id = t.inspeksi_id
JOIN public.igardu_ref r ON r.kode = t.kategori
LEFT JOIN public.igardu_isian_ref ii ON ii.kode = t.isian_item
JOIN public.hargardu_item_ref ir ON ir.kode = COALESCE(ii.item_tl, r.item_kode)
LEFT JOIN gd g ON g.k = upper(x.gardu_kode) AND g.u = upper(x.ulp)
LEFT JOIN tl ON tl.k = upper(x.gardu_kode) AND tl.u = upper(x.ulp) AND tl.item_kode = COALESCE(ii.item_tl, r.item_kode)
  AND tl.bagian = format('Inspeksi T%s %s', x.tier, to_char(x.tgl AT TIME ZONE 'Asia/Makassar', 'DD-MM-YY')) || CASE WHEN ii.kode IS NULL THEN '' ELSE ' · ' || ii.nama END
WHERE t.status_tl = 'Terbuka'
  AND x.status IN ('Selesai', 'Diverifikasi')
  AND NOT COALESCE(tl.status = 'Dikerjakan', false)
  -- Langsung ke tabel (terindeks): pemeliharaan sesudah inspeksi yang mencatat
  -- item ini normal menutup temuannya.
  AND NOT EXISTS (
    SELECT 1 FROM public.pemeliharaan_gardu pg
    WHERE pg.gardu_kode = x.gardu_kode AND pg.ulp = x.ulp
      AND pg.status = 'Diverifikasi' AND pg.tgl_selesai > x.tgl
      AND EXISTS (SELECT 1 FROM public.pemeliharaan_gardu_periksa p
                  WHERE p.pemeliharaan_id = pg.id AND p.item_kode = COALESCE(ii.item_tl, r.item_kode))
      AND NOT EXISTS (SELECT 1 FROM public.pemeliharaan_gardu_periksa p
                      LEFT JOIN public.hargardu_opsi_ref o ON o.item_kode = p.item_kode AND o.kode = p.nilai
                      WHERE p.pemeliharaan_id = pg.id AND p.item_kode = COALESCE(ii.item_tl, r.item_kode)
                        AND NOT COALESCE(o.normal, true)));
GRANT SELECT ON public.gardu_perlu_perbaikan TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT bagian, count(*) FROM igardu_isian_ref WHERE aktif GROUP BY bagian;
--   SELECT count(*) FROM gardu_perlu_perbaikan WHERE sumber = 'inspeksi_gardu';
