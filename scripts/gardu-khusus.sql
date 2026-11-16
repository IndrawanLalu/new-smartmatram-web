-- =============================================================================
-- Gardu Khusus (13 Nov 2026, rencana-gardu-khusus.md). Idempoten.
--
-- Gardu yang tidak dikerjakan PLN — di dalam bangunan, tanpa JTR (langsung ke
-- kWh meter pelanggan), atau dipelihara pelanggan — dikeluarkan dari TIGA
-- pekerjaan: Inspeksi Gardu, Inspeksi JTR, Pemeliharaan Gardu. Pengukuran,
-- Optimasi, dll TIDAK berubah (keputusan user).
--
-- Dua jalan masuk:
--   HP   petugas mengusulkan (alasan + keterangan + foto) → master_usulan
--        (sumber_modul 'gardu_khusus') → admin Setujui / Tolak di web.
--   Web  admin menetapkan langsung di Master Gardu (bisa banyak sekaligus).
-- Sekali ditetapkan: item WO yang masih terbuka untuk gardu itu DIBATALKAN
-- otomatis (teknisaplikasi butir 12), dan WO baru tidak memuatnya lagi.
--
-- Tabel sendiri, BUKAN kolom di `gardu`: Impor Master menimpa kolom `gardu`,
-- keputusan orang di lapangan tidak boleh ikut tertimpa. Kunci (kode, ulp) —
-- kode gardu tidak unik lintas ULP (butir 14).
--
-- Tanda AMG `gardu.data_amg->>'GRD KHUSUS'` = 'YA' hanya PETUNJUK di layar:
-- 63 dari 411 gardu bertanda itu pernah dipelihara HARGAR, 17 punya JTR.
-- =============================================================================


-- ── 1. Tabel ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gardu_khusus (
  kode            TEXT NOT NULL,
  ulp             TEXT NOT NULL,
  -- 'bangunan' di dalam bangunan · 'tanpa_jtr' tanpa JTR · 'pelanggan' dipelihara pelanggan
  alasan          TEXT[] NOT NULL,
  keterangan      TEXT,
  foto_url        TEXT,
  foto_lain       TEXT[] NOT NULL DEFAULT '{}',
  sumber          TEXT NOT NULL,
  usulan_id       UUID REFERENCES public.master_usulan(id) ON DELETE SET NULL,
  ditetapkan_uid  UUID,
  ditetapkan_oleh TEXT,
  ditetapkan_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kode, ulp),
  CONSTRAINT gardu_khusus_alasan_valid
    CHECK (cardinality(alasan) > 0 AND alasan <@ ARRAY['bangunan', 'tanpa_jtr', 'pelanggan']::text[]),
  CONSTRAINT gardu_khusus_sumber_valid CHECK (sumber IN ('hp', 'web'))
);
ALTER TABLE public.gardu_khusus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gardu_khusus_baca ON public.gardu_khusus;
CREATE POLICY gardu_khusus_baca ON public.gardu_khusus FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.gardu_khusus TO authenticated;
-- Penulisan HANYA lewat fungsi di bawah.

CREATE INDEX IF NOT EXISTS master_usulan_gardu_khusus_idx
  ON public.master_usulan (ulp, diusulkan_at DESC) WHERE sumber_modul = 'gardu_khusus';


-- ── 2. Satu aturan, satu tempat (butir 23.9) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.gardu_dikecualikan(p_kode TEXT, p_ulp TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.gardu_khusus k
                 WHERE k.kode = upper(btrim(p_kode)) AND k.ulp = upper(btrim(p_ulp)));
$fn$;
GRANT EXECUTE ON FUNCTION public.gardu_dikecualikan(TEXT, TEXT) TO authenticated;


-- ── 3. WO baru tidak memuat gardu khusus ────────────────────────────────────
-- Penjaga di TABEL, bukan di tiap penyusun WO: WO tiga modul ini disusun dari
-- banyak jalan (Susun WO, tempel Excel, rencana ULP, terbit otomatis pg_cron,
-- tunggakan). Layar web sudah menyaring lebih dulu; ini jaring pengamannya.
CREATE OR REPLACE FUNCTION public._gardu_khusus_lewati_wo()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  -- Bersarang, bukan AND: tabel lain tidak punya kolom `jenis`.
  IF TG_TABLE_NAME = 'wo_inspeksi_item' THEN
    IF NEW.jenis IS DISTINCT FROM 'JTR' THEN RETURN NEW; END IF;
  END IF;
  IF NEW.gardu_kode IS NOT NULL AND public.gardu_dikecualikan(NEW.gardu_kode, NEW.ulp) THEN
    RETURN NULL;  -- baris dilewati, sisanya jalan terus
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS gardu_khusus_lewati ON public.wo_igardu_item;
CREATE TRIGGER gardu_khusus_lewati BEFORE INSERT ON public.wo_igardu_item
  FOR EACH ROW EXECUTE FUNCTION public._gardu_khusus_lewati_wo();
DROP TRIGGER IF EXISTS gardu_khusus_lewati ON public.wo_inspeksi_item;
CREATE TRIGGER gardu_khusus_lewati BEFORE INSERT ON public.wo_inspeksi_item
  FOR EACH ROW EXECUTE FUNCTION public._gardu_khusus_lewati_wo();
DROP TRIGGER IF EXISTS gardu_khusus_lewati ON public.wo_hargardu_item;
CREATE TRIGGER gardu_khusus_lewati BEFORE INSERT ON public.wo_hargardu_item
  FOR EACH ROW EXECUTE FUNCTION public._gardu_khusus_lewati_wo();


-- ── 4. WO yang sudah terbit: item terbuka dibatalkan ────────────────────────
-- Memakai pengeluaran yang SUDAH ADA (wo-batal-semua.sql, inspeksi-gardu.sql):
-- yang sudah dikerjakan regu tidak tersentuh. Pemeliharaan Gardu: hanya WO
-- bulan ini dan sesudahnya — WO bulan lalu sudah jadi sejarah capaian, sisanya
-- dibawa ke bulan ini sebagai item baru.
CREATE OR REPLACE FUNCTION public._gardu_khusus_keluarkan_wo(p_kode TEXT, p_ulp TEXT, p_oleh TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  k      TEXT := upper(btrim(p_kode));
  u      TEXT := upper(btrim(p_ulp));
  sebab  CONSTANT TEXT := 'gardu khusus';
  w      TIMESTAMP := now() AT TIME ZONE 'Asia/Makassar';
  it     RECORD;
  n_ig   INT := 0;
  n_jtr  INT := 0;
  n_har  INT := 0;
BEGIN
  FOR it IN SELECT i.id FROM public.wo_igardu_item i
            WHERE upper(btrim(i.gardu_kode)) = k AND upper(btrim(i.ulp)) = u AND i.status = 'Terbuka'
            FOR UPDATE LOOP
    CONTINUE WHEN public._igardu_item_dikerjakan(it.id);
    UPDATE public.wo_igardu_item SET status = 'Dibatalkan', catatan = 'Dikeluarkan: ' || sebab, updated_at = now()
    WHERE id = it.id;
    n_ig := n_ig + 1;
  END LOOP;

  FOR it IN SELECT i.id FROM public.wo_inspeksi_item i
            WHERE i.jenis = 'JTR' AND upper(btrim(i.gardu_kode)) = k AND upper(btrim(i.ulp)) = u AND i.status = 'Terbuka' LOOP
    IF public._keluarkan_inspeksi_item(it.id, sebab, p_oleh) IS NULL THEN n_jtr := n_jtr + 1; END IF;
  END LOOP;

  FOR it IN SELECT i.id FROM public.wo_hargardu_item i JOIN public.wo_hargardu h ON h.id = i.wo_id
            WHERE upper(btrim(i.gardu_kode)) = k AND upper(btrim(i.ulp)) = u
              AND h.tahun * 12 + h.bulan >= extract(year FROM w)::int * 12 + extract(month FROM w)::int LOOP
    IF public._keluarkan_wo_gardu('hargardu', it.id, sebab, p_oleh) IS NULL THEN n_har := n_har + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('inspeksi_gardu', n_ig, 'inspeksi_jtr', n_jtr, 'pemeliharaan_gardu', n_har);
END $fn$;
REVOKE ALL ON FUNCTION public._gardu_khusus_keluarkan_wo(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Menyimpan satu gardu khusus + jejak + keluarkan WO. Tanpa penjaga hak
-- (pemanggilnya yang menjaga).
CREATE OR REPLACE FUNCTION public._gardu_khusus_simpan(
  p_kode TEXT, p_ulp TEXT, p_alasan TEXT[], p_keterangan TEXT, p_foto TEXT, p_foto_lain TEXT[],
  p_sumber TEXT, p_usulan UUID, p_oleh TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.gardu_khusus
    (kode, ulp, alasan, keterangan, foto_url, foto_lain, sumber, usulan_id, ditetapkan_uid, ditetapkan_oleh)
  VALUES (p_kode, p_ulp, p_alasan, NULLIF(btrim(COALESCE(p_keterangan, '')), ''), p_foto,
          COALESCE(p_foto_lain, '{}'), p_sumber, p_usulan, auth.uid(), p_oleh);

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, usulan_id, oleh_uid, oleh_nama)
  VALUES ('gardu', p_kode, p_ulp, 'khusus', 'false'::jsonb,
          jsonb_build_object('alasan', to_jsonb(p_alasan), 'keterangan', p_keterangan),
          CASE WHEN p_usulan IS NULL THEN 'sunting_admin' ELSE 'disetujui' END, p_usulan, auth.uid(), p_oleh);

  RETURN public._gardu_khusus_keluarkan_wo(p_kode, p_ulp, p_oleh);
END $fn$;
REVOKE ALL ON FUNCTION public._gardu_khusus_simpan(TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT[], TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._gardu_khusus_alasan_sah(p_alasan TEXT[])
RETURNS VOID LANGUAGE plpgsql IMMUTABLE AS $fn$
BEGIN
  IF COALESCE(cardinality(p_alasan), 0) = 0 THEN RAISE EXCEPTION 'Pilih minimal satu alasan gardu khusus.'; END IF;
  IF NOT (p_alasan <@ ARRAY['bangunan', 'tanpa_jtr', 'pelanggan']::text[]) THEN
    RAISE EXCEPTION 'Alasan gardu khusus tidak dikenal: %', p_alasan;
  END IF;
END $fn$;


-- ── 5. Web: tetapkan / kembalikan, banyak sekaligus ──────────────────────────
-- p_gardu = [{"kode": "...", "ulp": "..."}]. Yang tidak bisa DILEWATI dengan sebab.
CREATE OR REPLACE FUNCTION public.tetapkan_gardu_khusus(
  p_gardu JSONB, p_alasan TEXT[], p_keterangan TEXT DEFAULT NULL, p_oleh TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  x        JSONB;
  g        RECORD;
  h        JSONB;
  n        INT := 0;
  wo       JSONB := '{"inspeksi_gardu": 0, "inspeksi_jtr": 0, "pemeliharaan_gardu": 0}'::jsonb;
  dilewati JSONB := '[]'::jsonb;
  a        TEXT[] := ARRAY(SELECT DISTINCT unnest(COALESCE(p_alasan, '{}')) ORDER BY 1);
BEGIN
  PERFORM public._gardu_khusus_alasan_sah(a);
  IF jsonb_typeof(p_gardu) <> 'array' OR jsonb_array_length(p_gardu) = 0 THEN
    RAISE EXCEPTION 'Pilih minimal satu gardu.';
  END IF;
  IF jsonb_array_length(p_gardu) > 500 THEN RAISE EXCEPTION 'Paling banyak 500 gardu sekali tetapkan.'; END IF;

  FOR x IN SELECT * FROM jsonb_array_elements(p_gardu) LOOP
    SELECT upper(btrim(gg.kode)) AS kode, upper(btrim(gg.ulp)) AS ulp INTO g
    FROM public.gardu gg
    WHERE upper(btrim(gg.kode)) = upper(btrim(x->>'kode')) AND upper(btrim(gg.ulp)) = upper(btrim(x->>'ulp'))
    LIMIT 1;
    IF g.kode IS NULL THEN
      dilewati := dilewati || jsonb_build_object('gardu', x->>'kode', 'sebab', 'Tidak ada di master gardu.');
      CONTINUE;
    END IF;
    PERFORM public.wajib_boleh_ulp(g.ulp);
    IF public.gardu_dikecualikan(g.kode, g.ulp) THEN
      dilewati := dilewati || jsonb_build_object('gardu', g.kode, 'sebab', 'Sudah gardu khusus.');
      CONTINUE;
    END IF;

    h := public._gardu_khusus_simpan(g.kode, g.ulp, a, p_keterangan, NULL, '{}', 'web', NULL, p_oleh);
    wo := jsonb_build_object(
      'inspeksi_gardu', (wo->>'inspeksi_gardu')::int + (h->>'inspeksi_gardu')::int,
      'inspeksi_jtr', (wo->>'inspeksi_jtr')::int + (h->>'inspeksi_jtr')::int,
      'pemeliharaan_gardu', (wo->>'pemeliharaan_gardu')::int + (h->>'pemeliharaan_gardu')::int);

    -- Usulan HP yang masih menunggu untuk gardu ini selesai dengan sendirinya.
    UPDATE public.master_usulan
    SET status = 'disetujui', penilai_uid = auth.uid(), penilai_nama = p_oleh, dinilai_at = now(),
        alasan = 'Ditetapkan langsung oleh admin di Master Gardu.'
    WHERE sumber_modul = 'gardu_khusus' AND status = 'menunggu' AND entitas_kode = g.kode AND ulp = g.ulp;
    n := n + 1;
  END LOOP;

  RETURN jsonb_build_object('ditetapkan', n, 'dilewati', dilewati, 'wo_dibatalkan', wo);
END $fn$;
GRANT EXECUTE ON FUNCTION public.tetapkan_gardu_khusus(JSONB, TEXT[], TEXT, TEXT) TO authenticated;

-- Item WO yang sudah dibatalkan TIDAK dipulihkan: susun lagi di WO berikutnya.
CREATE OR REPLACE FUNCTION public.kembalikan_gardu_biasa(p_gardu JSONB, p_alasan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  x        JSONB;
  r        public.gardu_khusus;
  n        INT := 0;
  dilewati JSONB := '[]'::jsonb;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan wajib diisi.'; END IF;
  IF jsonb_typeof(p_gardu) <> 'array' OR jsonb_array_length(p_gardu) = 0 THEN
    RAISE EXCEPTION 'Pilih minimal satu gardu.';
  END IF;

  FOR x IN SELECT * FROM jsonb_array_elements(p_gardu) LOOP
    SELECT * INTO r FROM public.gardu_khusus
    WHERE kode = upper(btrim(x->>'kode')) AND ulp = upper(btrim(x->>'ulp')) FOR UPDATE;
    IF NOT FOUND THEN
      dilewati := dilewati || jsonb_build_object('gardu', x->>'kode', 'sebab', 'Bukan gardu khusus.');
      CONTINUE;
    END IF;
    PERFORM public.wajib_boleh_ulp(r.ulp);
    DELETE FROM public.gardu_khusus WHERE kode = r.kode AND ulp = r.ulp;
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('gardu', r.kode, r.ulp, 'khusus', to_jsonb(r),
            jsonb_build_object('khusus', false, 'alasan', btrim(p_alasan)), 'sunting_admin', auth.uid(), p_oleh);
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('dikembalikan', n, 'dilewati', dilewati);
END $fn$;
GRANT EXECUTE ON FUNCTION public.kembalikan_gardu_biasa(JSONB, TEXT, TEXT) TO authenticated;


-- ── 6. HP: usulan petugas (butir 17: foto sudah terunggah, satu RPC) ─────────
-- p_isi: {id, kode, ulp, alasan[], keterangan, foto_url, foto_lain[], modul,
--         petugas_nama, lat, lng, akurasi}
-- Kiriman ulang dengan id yang sama memperbarui usulan yang sama (yang ditolak
-- dikirim ulang, atau kiriman yang putus di tengah).
CREATE OR REPLACE FUNCTION public.usulkan_gardu_khusus(p_isi JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id   UUID := NULLIF(p_isi->>'id', '')::uuid;
  a      TEXT[] := ARRAY(SELECT DISTINCT jsonb_array_elements_text(COALESCE(p_isi->'alasan', '[]')) ORDER BY 1);
  ket    TEXT := NULLIF(btrim(COALESCE(p_isi->>'keterangan', '')), '');
  foto   TEXT := NULLIF(btrim(COALESCE(p_isi->>'foto_url', '')), '');
  lain   TEXT[] := ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_isi->'foto_lain', '[]')));
  modul  TEXT := COALESCE(NULLIF(p_isi->>'modul', ''), 'lain');
  nama   TEXT := NULLIF(btrim(COALESCE(p_isi->>'petugas_nama', '')), '');
  f      TEXT;
  g      RECORD;
  r      RECORD;
  ada    public.master_usulan;
  isi    JSONB;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'Id usulan kosong — perbarui aplikasi.'; END IF;
  SELECT ur.role, ur.unit, ro.sees_all_units INTO r
  FROM public.user_roles ur LEFT JOIN public.roles ro ON ro.code = ur.role
  WHERE ur.user_id = auth.uid();
  IF r.role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi — isian tetap tersimpan di HP.';
  END IF;

  SELECT upper(btrim(gg.kode)) AS kode, upper(btrim(gg.ulp)) AS ulp INTO g
  FROM public.gardu gg
  WHERE upper(btrim(gg.kode)) = upper(btrim(p_isi->>'kode')) AND upper(btrim(gg.ulp)) = upper(btrim(p_isi->>'ulp'))
  LIMIT 1;
  IF g.kode IS NULL THEN RAISE EXCEPTION 'Gardu % tidak ada di master gardu ULP %.', p_isi->>'kode', p_isi->>'ulp'; END IF;
  IF NOT COALESCE(r.sees_all_units, false) AND upper(COALESCE(r.unit, '')) <> g.ulp THEN
    RAISE EXCEPTION 'Gardu % milik ULP %, akun ini ULP %.', g.kode, g.ulp, COALESCE(r.unit, '-');
  END IF;

  PERFORM public._gardu_khusus_alasan_sah(a);
  IF ket IS NULL THEN RAISE EXCEPTION 'Keterangan wajib diisi.'; END IF;
  IF foto IS NULL THEN RAISE EXCEPTION 'Foto gardu wajib (minimal satu).'; END IF;
  IF COALESCE(cardinality(lain), 0) > 2 THEN RAISE EXCEPTION 'Foto paling banyak 3.'; END IF;
  FOREACH f IN ARRAY (ARRAY[foto] || lain) LOOP
    IF f !~* '^https?://' THEN RAISE EXCEPTION 'Foto belum terunggah (masih di HP) — kirim ulang.'; END IF;
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtext('gardu_khusus|' || g.kode || '|' || g.ulp));
  IF public.gardu_dikecualikan(g.kode, g.ulp) THEN
    RAISE EXCEPTION 'Gardu % sudah tercatat sebagai gardu khusus — tidak perlu diusulkan lagi.', g.kode;
  END IF;

  isi := jsonb_build_object('alasan', to_jsonb(a), 'keterangan', ket, 'foto_url', foto,
                            'foto_lain', to_jsonb(lain), 'modul', modul);

  SELECT * INTO ada FROM public.master_usulan WHERE id = v_id FOR UPDATE;
  IF FOUND THEN
    IF ada.sumber_modul IS DISTINCT FROM 'gardu_khusus' OR ada.entitas_kode <> g.kode OR ada.ulp <> g.ulp THEN
      RAISE EXCEPTION 'Id usulan bentrok dengan catatan lain — buang draf ini lalu isi ulang.';
    END IF;
    IF ada.status = 'disetujui' THEN RAISE EXCEPTION 'Usulan ini sudah disetujui admin.'; END IF;
    UPDATE public.master_usulan
    SET nilai_baru = isi, bukti_foto = ARRAY[foto] || lain, catatan = ket,
        bukti_lat = (p_isi->>'lat')::float8, bukti_lng = (p_isi->>'lng')::float8,
        bukti_akurasi = (p_isi->>'akurasi')::numeric,
        pengusul_uid = auth.uid(), pengusul_nama = nama, diusulkan_at = now(),
        status = 'menunggu', penilai_uid = NULL, penilai_nama = NULL, dinilai_at = NULL, alasan = NULL
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  SELECT * INTO ada FROM public.master_usulan
  WHERE sumber_modul = 'gardu_khusus' AND status = 'menunggu' AND entitas_kode = g.kode AND ulp = g.ulp
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Gardu % sudah diusulkan sebagai gardu khusus oleh % dan sedang menunggu persetujuan admin.',
      g.kode, COALESCE(ada.pengusul_nama, 'regu lain');
  END IF;

  INSERT INTO public.master_usulan
    (id, entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, bukti_lat, bukti_lng, bukti_akurasi,
     bukti_foto, catatan, sumber_modul, sumber_id, pengusul_uid, pengusul_nama)
  VALUES
    (v_id, 'gardu', g.kode, g.ulp, 'khusus', 'false'::jsonb, isi,
     (p_isi->>'lat')::float8, (p_isi->>'lng')::float8, (p_isi->>'akurasi')::numeric,
     ARRAY[foto] || lain, ket, 'gardu_khusus', v_id, auth.uid(), nama);
  RETURN v_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.usulkan_gardu_khusus(JSONB) TO authenticated;


-- ── 7. Web: putusan usulan ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.putuskan_gardu_khusus(
  p_usulan UUID, p_setuju BOOLEAN, p_alasan TEXT DEFAULT NULL, p_oleh TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  u  public.master_usulan;
  h  JSONB := NULL;
  a  TEXT[];
BEGIN
  SELECT * INTO u FROM public.master_usulan WHERE id = p_usulan AND sumber_modul = 'gardu_khusus' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usulan gardu khusus tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_ulp(u.ulp);
  IF u.status <> 'menunggu' THEN RAISE EXCEPTION 'Usulan ini sudah %.', u.status; END IF;

  IF NOT p_setuju THEN
    IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan penolakan wajib diisi.'; END IF;
  ELSIF NOT public.gardu_dikecualikan(u.entitas_kode, u.ulp) THEN
    a := ARRAY(SELECT jsonb_array_elements_text(u.nilai_baru->'alasan'));
    h := public._gardu_khusus_simpan(
      u.entitas_kode, u.ulp, a, u.nilai_baru->>'keterangan', u.nilai_baru->>'foto_url',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(u.nilai_baru->'foto_lain', '[]'))),
      'hp', u.id, p_oleh);
  END IF;

  UPDATE public.master_usulan
  SET status = CASE WHEN p_setuju THEN 'disetujui' ELSE 'ditolak' END,
      penilai_uid = auth.uid(), penilai_nama = p_oleh, dinilai_at = now(),
      alasan = NULLIF(btrim(COALESCE(p_alasan, '')), ''),
      diterapkan_at = CASE WHEN p_setuju THEN now() END
  WHERE id = u.id;

  RETURN jsonb_build_object('wo_dibatalkan', h);
END $fn$;
GRANT EXECUTE ON FUNCTION public.putuskan_gardu_khusus(UUID, BOOLEAN, TEXT, TEXT) TO authenticated;


-- ── 8. View untuk web & HP ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.gardu_khusus_daftar AS
SELECT k.kode, k.ulp, g.nama, g.alamat, g.feeder AS penyulang,
       k.alasan, k.keterangan, k.foto_url, k.foto_lain, k.sumber, k.usulan_id,
       k.ditetapkan_oleh, k.ditetapkan_at
FROM public.gardu_khusus k
LEFT JOIN LATERAL (
  SELECT gg.nama, gg.alamat, gg.feeder FROM public.gardu gg
  WHERE upper(btrim(gg.kode)) = k.kode AND upper(btrim(gg.ulp)) = k.ulp LIMIT 1
) g ON true;
GRANT SELECT ON public.gardu_khusus_daftar TO authenticated;

CREATE OR REPLACE VIEW public.gardu_khusus_usulan AS
SELECT u.id, u.entitas_kode AS kode, u.ulp, g.nama, g.alamat, g.feeder AS penyulang,
       ARRAY(SELECT jsonb_array_elements_text(u.nilai_baru->'alasan')) AS alasan,
       u.nilai_baru->>'keterangan' AS keterangan,
       u.nilai_baru->>'foto_url' AS foto_url,
       ARRAY(SELECT jsonb_array_elements_text(COALESCE(u.nilai_baru->'foto_lain', '[]'))) AS foto_lain,
       u.nilai_baru->>'modul' AS modul,
       u.bukti_lat AS lat, u.bukti_lng AS lng, u.bukti_akurasi AS akurasi,
       u.status, u.pengusul_nama, u.diusulkan_at, u.penilai_nama, u.dinilai_at,
       u.alasan AS alasan_putusan
FROM public.master_usulan u
LEFT JOIN LATERAL (
  SELECT gg.nama, gg.alamat, gg.feeder FROM public.gardu gg
  WHERE upper(btrim(gg.kode)) = u.entitas_kode AND upper(btrim(gg.ulp)) = u.ulp LIMIT 1
) g ON true
WHERE u.sumber_modul = 'gardu_khusus';
GRANT SELECT ON public.gardu_khusus_usulan TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname = 'gardu_khusus_lewati';
--   SELECT * FROM gardu_khusus_daftar ORDER BY ditetapkan_at DESC LIMIT 20;
--   SELECT kode, ulp, status, pengusul_nama, diusulkan_at FROM gardu_khusus_usulan ORDER BY diusulkan_at DESC;
