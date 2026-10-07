-- =============================================================================
-- Batalkan segmen / ulangi inspeksi JTM dari HP — keputusan user 7 Okt 2026
-- (`rencana-batal-segmen-hp.md`). Jalankan manual di Supabase SQL Editor,
-- SESUDAH `wo-jtm-tier.sql`. Idempoten.
--
-- Dulu: HP hanya bisa membatalkan RINTISAN TERBUKA (segmen yang sedang
-- dirintis), siapa pun se-ULP, termasuk yang sudah menunggu persetujuan.
-- Sekarang satu pintu, dua jalan — server yang memilih, bukan HP:
--
--   BATALKAN SEGMEN  segmen hasil rintis, belum masuk WO, belum pernah
--                    disetujui → segmen nonaktif, tiangnya dibatalkan. Segmen
--                    sesudahnya (yang menyambung dari sini) IKUT dibatalkan
--                    dalam satu transaksi, dari ujung ke atas — HP menampilkan
--                    daftarnya dulu (keputusan 2).
--   ULANGI INSPEKSI  segmen masuk WO / segmen master / pernah disetujui →
--                    segmennya TETAP; inspeksinya dibatalkan, tiang yang LAHIR
--                    di inspeksi itu dibatalkan, dan item WO-nya kembali
--                    "belum dikerjakan" (keputusan 1).
--
-- Siapa (keputusan 3 & 4):
--   • perintis segmen (batalkan) / petugas inspeksinya (ulangi), atau admin
--     ULP itu / UP3;
--   • yang sudah DIKIRIM (menunggu persetujuan) → admin saja;
--   • yang sudah DISETUJUI → tidak bisa dari HP.
-- "Orang yang sama" = akun (petugas_uid) yang sama DAN nama petugas yang sama:
-- satu akun bisa dipakai bergantian beberapa petugas (teknisaplikasi butir 16).
--
-- Tiang tidak menyimpan inspeksi asalnya. "Lahir di inspeksi ini" = hanya
-- milik segmen ini, dibuat sesudah inspeksi dimulai, dan tidak dinilai
-- inspeksi lain yang masih hidup.
--
--   1. Pembantu: _jtm_admin, _jtm_orang_sama, _jtm_milik, _jtm_rantai,
--      _jtm_cek_sambungan
--   2. _batalkan_segmen_inti — isi `batalkan_segmen_rintisan` lama, DISALIN
--      UTUH dari `jtm-batal-segmen.sql` (tanpa pemeriksaan hak — kini di 4)
--   3. _ulangi_inspeksi_inti
--   4. _jtm_rencana_batal — SATU tempat semua aturan; dipakai pratinjau & eksekusi
--   5. pratinjau_batal_jtm, batalkan_jtm_hp (pintu HP baru)
--   6. batalkan_segmen_rintisan — tanda tangan lama (lembar Rintis, HP lama),
--      kini lewat aturan yang sama; satu segmen saja, tanpa rantai.
--   7. Tiang BATAL keluar dari segmennya (pemicu + bersihkan yang terlanjur).
--      Penyebab "45/50 tiang dinilai" di persetujuan: `batalkan_tiang` (hapus
--      tiang salah dititik) membiarkan keanggotaan segmen, sementara
--      `inspeksi_jtm_ringkas` & `master_segmen` menghitung SEMUA anggota,
--      termasuk yang batal. Penjaga Selesai hanya menghitung yang aktif, jadi
--      kirim tetap lolos. Cek dampaknya dulu: `cek-jtm-tiang-batal-segmen.sql`.
--   8. jtm_segmen_yatim — segmen hasil rintis tanpa inspeksi hidup, tanpa WO
--      (bekas inspeksi yang dibatalkan dari web). Dihapus dari Master Segmen.
-- =============================================================================


-- ── 1. Pembantu ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._jtm_admin(p_ulp TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE((
    SELECT r.role = 'UP3' OR (r.role = 'admin' AND upper(COALESCE(r.unit, '')) = upper(COALESCE(p_ulp, '')))
    FROM public.user_roles r WHERE r.user_id = auth.uid() LIMIT 1), false);
$fn$;

-- Akun sama DAN (kalau keduanya tercatat) nama petugas sama.
CREATE OR REPLACE FUNCTION public._jtm_orang_sama(p_uid UUID, p_nama_tercatat TEXT, p_nama TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT (p_uid IS NULL OR p_uid = auth.uid())
     AND (NULLIF(btrim(COALESCE(p_nama_tercatat, '')), '') IS NULL
          OR NULLIF(btrim(COALESCE(p_nama, '')), '') IS NULL
          OR upper(btrim(p_nama_tercatat)) = upper(btrim(p_nama)))
     AND NOT (p_uid IS NULL AND NULLIF(btrim(COALESCE(p_nama_tercatat, '')), '') IS NULL);
$fn$;

-- Tiang aktif yang HANYA milik segmen ini (aturan `batalkan_segmen_rintisan`).
CREATE OR REPLACE FUNCTION public._jtm_milik(p_segmen UUID)
RETURNS UUID[] LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT COALESCE(array_agg(st.tiang_id), '{}')
    FROM public.segmen_tiang st JOIN public.tiang tg ON tg.id = st.tiang_id
   WHERE st.segmen_id = p_segmen AND tg.status_hidup = 'aktif'
     AND NOT EXISTS (SELECT 1 FROM public.segmen_tiang o JOIN public.segmen so ON so.id = o.segmen_id
                      WHERE o.tiang_id = st.tiang_id AND o.segmen_id <> p_segmen AND so.status = 'aktif');
$fn$;

-- Segmen ini + semua segmen aktif yang menyambung darinya, turun-temurun.
-- Kedalaman = jarak dari segmen ini; eksekusi berjalan dari yang terdalam.
CREATE OR REPLACE FUNCTION public._jtm_rantai(p_segmen UUID)
RETURNS TABLE (segmen_id UUID, kedalaman INT) LANGUAGE sql STABLE SET search_path = public AS $fn$
  WITH RECURSIVE r(sid, k) AS (
    SELECT p_segmen, 0
    UNION
    SELECT o.id, r.k + 1
      FROM r JOIN public.segmen o
        ON o.status = 'aktif' AND o.id <> r.sid
       AND (o.induk_segmen_id = r.sid OR o.titik_awal_tiang_id = ANY(public._jtm_milik(r.sid)))
     WHERE r.k < 50
  )
  SELECT sid, max(k) FROM r GROUP BY sid;
$fn$;

-- Ada yang menyambung ke tiang-tiang ini dari LUAR himpunannya? NULL = aman.
CREATE OR REPLACE FUNCTION public._jtm_cek_sambungan(p_tiang UUID[], p_segmen UUID[])
RETURNS TEXT LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE
  hal TEXT;
BEGIN
  IF COALESCE(cardinality(p_tiang), 0) = 0 THEN RETURN NULL; END IF;
  SELECT string_agg(o.nama, ', ') INTO hal FROM public.segmen o
   WHERE o.status = 'aktif' AND NOT (o.id = ANY(p_segmen))
     AND (o.titik_awal_tiang_id = ANY(p_tiang) OR o.titik_akhir_tiang_id = ANY(p_tiang));
  IF hal IS NOT NULL THEN RETURN format('Segmen %s berujung di tiang yang akan dibatalkan.', hal); END IF;
  SELECT string_agg(DISTINCT a.kode, ', ') INTO hal FROM public.tiang a
   WHERE a.status_hidup = 'aktif' AND NOT (a.id = ANY(p_tiang))
     AND (a.induk_id = ANY(p_tiang) OR a.induk_jtr_id = ANY(p_tiang));
  IF hal IS NULL THEN
    SELECT string_agg(DISTINCT tp.tiang_id::text, ', ') INTO hal FROM public.tiang_jtr_tumpang tp
     WHERE tp.status = 'aktif' AND tp.induk_id = ANY(p_tiang);
  END IF;
  IF hal IS NOT NULL THEN
    RETURN format('Tiang %s menyambung dari tiang yang akan dibatalkan — pindahkan sambungannya dulu.', hal);
  END IF;
  RETURN NULL;
END $fn$;


-- ── 2. Inti batal segmen ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._batalkan_segmen_inti(
  p_segmen_id UUID,
  p_alasan    TEXT,
  p_nama      TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s        RECORD;
  milik    UUID[];
  dilepas  INT;
  hal      TEXT;
  t        RECORD;
BEGIN
  SELECT * INTO s FROM public.segmen WHERE id = p_segmen_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;

  -- Tiang yang hanya milik segmen ini.
  SELECT array_agg(st.tiang_id) INTO milik
    FROM public.segmen_tiang st JOIN public.tiang tg ON tg.id = st.tiang_id
   WHERE st.segmen_id = s.id AND tg.status_hidup = 'aktif'
     AND NOT EXISTS (SELECT 1 FROM public.segmen_tiang o JOIN public.segmen so ON so.id = o.segmen_id
                      WHERE o.tiang_id = st.tiang_id AND o.segmen_id <> s.id AND so.status = 'aktif');
  milik := COALESCE(milik, '{}');

  -- Segmen lain yang berpangkal / berinduk di sini.
  SELECT string_agg(o.nama, ', ') INTO hal FROM public.segmen o
   WHERE o.status = 'aktif' AND o.id <> s.id
     AND (o.induk_segmen_id = s.id OR o.titik_awal_tiang_id = ANY(milik));
  IF hal IS NOT NULL THEN
    RAISE EXCEPTION 'Segmen % menyambung dari segmen ini — batalkan yang itu dulu.', hal;
  END IF;

  -- Tiang lain (JTR, tiang segmen lain) yang induknya tiang segmen ini.
  SELECT string_agg(DISTINCT a.kode, ', ') INTO hal FROM public.tiang a
   WHERE a.status_hidup = 'aktif' AND NOT (a.id = ANY(milik))
     AND (a.induk_id = ANY(milik) OR a.induk_jtr_id = ANY(milik));
  IF hal IS NULL THEN
    SELECT string_agg(DISTINCT tp.tiang_id::text, ', ') INTO hal FROM public.tiang_jtr_tumpang tp
     WHERE tp.status = 'aktif' AND tp.induk_id = ANY(milik);
  END IF;
  IF hal IS NOT NULL THEN
    RAISE EXCEPTION 'Tiang % menyambung dari tiang segmen ini — pindahkan sambungannya dulu.', hal;
  END IF;

  -- ── Jalankan ──
  FOR t IN SELECT * FROM public.tiang WHERE id = ANY(milik) LOOP
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'status_hidup', to_jsonb(t.status_hidup),
            jsonb_build_object('status', 'batal', 'alasan', p_alasan, 'segmen', s.nama,
              'nama_dibuang', COALESCE((SELECT array_agg(penyulang || '=' || kode) FROM public.tiang_kode_penyulang
                                         WHERE tiang_id = t.id), '{}')),
            'batal_segmen_rintisan', auth.uid(), p_nama);
  END LOOP;
  DELETE FROM public.tiang_kode_penyulang WHERE tiang_id = ANY(milik);
  UPDATE public.tiang_jtr_tumpang SET status = 'lepas', catatan = 'segmennya dibatalkan: ' || p_alasan, updated_at = now()
   WHERE tiang_id = ANY(milik) AND status = 'aktif';
  UPDATE public.tiang SET status_hidup = 'batal', aktif_sampai = CURRENT_DATE, catatan = p_alasan, updated_at = now()
   WHERE id = ANY(milik);

  DELETE FROM public.segmen_tiang WHERE segmen_id = s.id;
  GET DIAGNOSTICS dilepas = ROW_COUNT;

  UPDATE public.inspeksi_jtm
     SET status = 'Dibatalkan', verified_at = now(), verified_by = p_nama, verified_note = p_alasan, updated_at = now()
   WHERE segmen_id = s.id AND status <> 'Dibatalkan';

  UPDATE public.segmen
     SET status = 'nonaktif', catatan = concat_ws(' · ', NULLIF(catatan, ''), 'Dibatalkan dari lapangan: ' || btrim(p_alasan)),
         updated_at = now()
   WHERE id = s.id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('segmen', s.nama, s.ulp, 'status', to_jsonb(s.status),
          jsonb_build_object('status', 'nonaktif', 'alasan', p_alasan, 'tiang_dibatalkan', cardinality(milik)),
          'batal_segmen_rintisan', auth.uid(), p_nama);

  RETURN jsonb_build_object('tiang_dibatalkan', cardinality(milik), 'tiang_dilepas', dilepas - cardinality(milik));
END $fn$;
-- Hanya dipanggil fungsi di skrip ini; tidak untuk HP/web langsung.
REVOKE ALL ON FUNCTION public._batalkan_segmen_inti(UUID, TEXT, TEXT) FROM PUBLIC;


-- ── 3. Inti ulangi inspeksi ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._ulangi_inspeksi_inti(p_inspeksi_id UUID, p_alasan TEXT, p_nama TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  m    RECORD;
  baru UUID[];
  t    RECORD;
  hal  TEXT;
BEGIN
  SELECT * INTO m FROM public.inspeksi_jtm WHERE id = p_inspeksi_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspeksi tidak ditemukan'; END IF;

  -- Tiang yang LAHIR di inspeksi ini (lihat kepala skrip).
  SELECT COALESCE(array_agg(x), '{}') INTO baru
    FROM unnest(public._jtm_milik(m.segmen_id)) x
    JOIN public.tiang tg ON tg.id = x
   WHERE tg.created_at >= m.tgl_mulai
     AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm_titik k JOIN public.inspeksi_jtm o ON o.id = k.inspeksi_id
                      WHERE k.tiang_id = x AND o.id <> m.id AND o.status <> 'Dibatalkan');

  -- Ujung segmen ini sendiri ikut dihitung "dari luar": segmen tetap hidup,
  -- jadi ujungnya tidak boleh menunjuk tiang yang dibatalkan.
  hal := public._jtm_cek_sambungan(baru, '{}'::uuid[]);
  IF hal IS NOT NULL THEN RAISE EXCEPTION '%', hal; END IF;

  FOR t IN SELECT * FROM public.tiang WHERE id = ANY(baru) LOOP
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'status_hidup', to_jsonb(t.status_hidup),
            jsonb_build_object('status', 'batal', 'alasan', p_alasan, 'inspeksi', m.id,
              'nama_dibuang', COALESCE((SELECT array_agg(penyulang || '=' || kode) FROM public.tiang_kode_penyulang
                                         WHERE tiang_id = t.id), '{}')),
            'ulangi_inspeksi_jtm', auth.uid(), p_nama);
  END LOOP;
  DELETE FROM public.tiang_kode_penyulang WHERE tiang_id = ANY(baru);
  UPDATE public.tiang_jtr_tumpang SET status = 'lepas', catatan = 'inspeksinya diulang: ' || p_alasan, updated_at = now()
   WHERE tiang_id = ANY(baru) AND status = 'aktif';
  UPDATE public.tiang SET status_hidup = 'batal', aktif_sampai = CURRENT_DATE, catatan = p_alasan, updated_at = now()
   WHERE id = ANY(baru);
  DELETE FROM public.segmen_tiang WHERE segmen_id = m.segmen_id AND tiang_id = ANY(baru);

  -- Item WO TIDAK disentuh: masih Terbuka, dan view status menurunkan
  -- tahapnya dari inspeksi yang hidup — tidak ada lagi → "Belum dimulai".
  UPDATE public.inspeksi_jtm
     SET status = 'Dibatalkan', verified_at = now(), verified_by = p_nama,
         verified_note = 'Diulang dari lapangan: ' || btrim(p_alasan), updated_at = now()
   WHERE id = m.id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('inspeksi_jtm', m.id::text, m.ulp, 'status', to_jsonb(m.status),
          jsonb_build_object('status', 'Dibatalkan', 'alasan', p_alasan, 'tiang_dibatalkan', cardinality(baru)),
          'ulangi_inspeksi_jtm', auth.uid(), p_nama);

  RETURN jsonb_build_object('mode', 'ulangi', 'tiang_dibatalkan', cardinality(baru));
END $fn$;
REVOKE ALL ON FUNCTION public._ulangi_inspeksi_inti(UUID, TEXT, TEXT) FROM PUBLIC;


-- ── 4. Aturan — satu tempat ──────────────────────────────────────────────────
-- Hasil: { mode: 'segmen'|'ulangi'|null, boleh, tolak, admin, inspeksi_id,
--          tiang, segmen: [ {id, nama, tiang, perintis, kedalaman, halangan} ] }
CREATE OR REPLACE FUNCTION public._jtm_rencana_batal(p_segmen_id UUID, p_tier TEXT, p_nama TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s       RECORD;
  m       RECORD;
  sg      RECORD;
  awal    RECORD;
  adm     BOOLEAN;
  v_tier  TEXT := COALESCE(NULLIF(btrim(COALESCE(p_tier, '')), ''), '1');
  daftar  JSONB := '[]'::jsonb;
  halang  TEXT;
  semua_milik UUID[] := '{}';
  semua_seg   UUID[] := '{}';
  ada_halang  BOOLEAN := false;
  baru    INT;
  hal     TEXT;
  tolak   JSONB := jsonb_build_object('mode', NULL, 'boleh', false);
BEGIN
  SELECT * INTO s FROM public.segmen WHERE id = p_segmen_id;
  IF NOT FOUND THEN RETURN tolak || jsonb_build_object('tolak', 'Segmen tidak ditemukan.'); END IF;
  IF s.status <> 'aktif' THEN RETURN tolak || jsonb_build_object('tolak', format('Segmen %s sudah tidak aktif.', s.nama)); END IF;
  adm := public._jtm_admin(s.ulp);

  IF s.sumber = 'lapangan'
     AND NOT EXISTS (SELECT 1 FROM public.wo_inspeksi_item WHERE segmen_id = s.id AND status <> 'Dibatalkan')
     AND NOT EXISTS (SELECT 1 FROM public.wo_perabasan_item WHERE segmen_id = s.id AND status <> 'Dibatalkan')
     AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm WHERE segmen_id = s.id AND status = 'Diverifikasi') THEN
    -- ── BATALKAN SEGMEN (beserta rantainya) ──
    FOR sg IN
      SELECT g.*, r.kedalaman FROM public._jtm_rantai(s.id) r JOIN public.segmen g ON g.id = r.segmen_id
      ORDER BY r.kedalaman, g.nama
    LOOP
      halang := NULL;
      SELECT petugas_uid, petugas_nama INTO awal FROM public.inspeksi_jtm
       WHERE segmen_id = sg.id ORDER BY created_at LIMIT 1;
      IF sg.sumber IS DISTINCT FROM 'lapangan' THEN
        halang := 'bukan hasil rintis lapangan — perubahannya lewat Master Segmen di web';
      ELSIF EXISTS (SELECT 1 FROM public.wo_inspeksi_item WHERE segmen_id = sg.id AND status <> 'Dibatalkan')
         OR EXISTS (SELECT 1 FROM public.wo_perabasan_item WHERE segmen_id = sg.id AND status <> 'Dibatalkan') THEN
        halang := 'sudah masuk WO — minta admin mengeluarkannya dari WO dulu';
      ELSIF EXISTS (SELECT 1 FROM public.inspeksi_jtm WHERE segmen_id = sg.id AND status = 'Diverifikasi') THEN
        halang := 'penyapuannya sudah disetujui admin';
      ELSIF NOT adm AND EXISTS (SELECT 1 FROM public.inspeksi_jtm WHERE segmen_id = sg.id AND status = 'Selesai') THEN
        halang := 'sudah dikirim dan menunggu persetujuan — hanya admin yang bisa membatalkannya';
      ELSIF NOT adm AND NOT public._jtm_orang_sama(awal.petugas_uid, awal.petugas_nama, p_nama) THEN
        halang := format('dirintis %s — hanya perintisnya atau admin ULP yang boleh membatalkan',
                         COALESCE(awal.petugas_nama, 'petugas lain'));
      END IF;
      ada_halang := ada_halang OR halang IS NOT NULL;
      semua_seg := semua_seg || sg.id;
      semua_milik := semua_milik || public._jtm_milik(sg.id);
      daftar := daftar || jsonb_build_object(
        'id', sg.id, 'nama', sg.nama, 'kedalaman', sg.kedalaman,
        'tiang', cardinality(public._jtm_milik(sg.id)),
        'perintis', awal.petugas_nama, 'halangan', halang);
    END LOOP;
    hal := public._jtm_cek_sambungan(semua_milik, semua_seg);
    RETURN jsonb_build_object(
      'mode', 'segmen', 'admin', adm, 'segmen', daftar, 'tiang', cardinality(semua_milik),
      'boleh', NOT ada_halang AND hal IS NULL,
      'tolak', CASE WHEN hal IS NOT NULL THEN hal
                    WHEN ada_halang THEN 'Ada segmen yang tidak bisa dibatalkan — lihat daftarnya.' END);
  END IF;

  -- ── ULANGI INSPEKSI ──
  SELECT * INTO m FROM public.inspeksi_jtm
   WHERE segmen_id = s.id AND tier = v_tier AND status <> 'Dibatalkan'
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN tolak || jsonb_build_object('mode', 'ulangi',
      'tolak', format('Belum ada inspeksi Tier %s di segmen ini yang bisa diulang.', v_tier));
  END IF;
  IF m.status = 'Diverifikasi' THEN
    RETURN tolak || jsonb_build_object('mode', 'ulangi',
      'tolak', 'Inspeksi terakhir segmen ini sudah disetujui admin — tidak bisa diulang dari HP.');
  END IF;
  IF m.status = 'Selesai' AND NOT adm THEN
    RETURN tolak || jsonb_build_object('mode', 'ulangi',
      'tolak', 'Inspeksi ini sudah dikirim dan menunggu persetujuan — hanya admin yang bisa membatalkannya.');
  END IF;
  IF NOT adm AND NOT public._jtm_orang_sama(m.petugas_uid, m.petugas_nama, p_nama) THEN
    RETURN tolak || jsonb_build_object('mode', 'ulangi',
      'tolak', format('Inspeksi ini dikerjakan %s — hanya dia atau admin ULP yang boleh mengulangnya.',
                      COALESCE(m.petugas_nama, 'petugas lain')));
  END IF;

  SELECT count(*) INTO baru
    FROM unnest(public._jtm_milik(s.id)) x JOIN public.tiang tg ON tg.id = x
   WHERE tg.created_at >= m.tgl_mulai
     AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm_titik k JOIN public.inspeksi_jtm o ON o.id = k.inspeksi_id
                      WHERE k.tiang_id = x AND o.id <> m.id AND o.status <> 'Dibatalkan');
  RETURN jsonb_build_object(
    'mode', 'ulangi', 'boleh', true, 'admin', adm, 'inspeksi_id', m.id, 'tiang', baru,
    'wo', EXISTS (SELECT 1 FROM public.wo_inspeksi_item WHERE id = m.wo_item_id AND status = 'Terbuka'),
    'segmen', jsonb_build_array(jsonb_build_object('id', s.id, 'nama', s.nama, 'kedalaman', 0, 'tiang', baru,
                                                   'perintis', m.petugas_nama, 'halangan', NULL)));
END $fn$;
REVOKE ALL ON FUNCTION public._jtm_rencana_batal(UUID, TEXT, TEXT) FROM PUBLIC;


-- ── 5. Pintu HP ──────────────────────────────────────────────────────────────
-- Pratinjau: HP menampilkan apa yang akan terjadi SEBELUM regu menekan "ya".
CREATE OR REPLACE FUNCTION public.pratinjau_batal_jtm(p_segmen_id UUID, p_tier TEXT, p_nama TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public._jtm_rencana_batal(p_segmen_id, p_tier, p_nama);
$fn$;
GRANT EXECUTE ON FUNCTION public.pratinjau_batal_jtm(UUID, TEXT, TEXT) TO authenticated;

-- Eksekusi: aturan DIHITUNG ULANG di sini (pratinjau bisa basi), satu transaksi.
CREATE OR REPLACE FUNCTION public.batalkan_jtm_hp(p_segmen_id UUID, p_tier TEXT, p_alasan TEXT, p_nama TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r       JSONB;
  x       JSONB;
  h       JSONB;
  n_seg   INT := 0;
  n_tiang INT := 0;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi'; END IF;
  r := public._jtm_rencana_batal(p_segmen_id, p_tier, p_nama);
  IF NOT COALESCE((r->>'boleh')::boolean, false) THEN
    RAISE EXCEPTION '%', COALESCE(r->>'tolak', 'Tidak bisa dibatalkan.');
  END IF;

  IF r->>'mode' = 'ulangi' THEN
    RETURN public._ulangi_inspeksi_inti((r->>'inspeksi_id')::uuid, p_alasan, p_nama);
  END IF;

  -- Dari yang terdalam ke atas: tiap segmen dibatalkan sesudah semua yang
  -- menyambung darinya sudah tidak aktif.
  FOR x IN SELECT e FROM jsonb_array_elements(r->'segmen') e ORDER BY (e->>'kedalaman')::int DESC LOOP
    h := public._batalkan_segmen_inti((x->>'id')::uuid, p_alasan, p_nama);
    n_seg := n_seg + 1;
    n_tiang := n_tiang + COALESCE((h->>'tiang_dibatalkan')::int, 0);
  END LOOP;
  RETURN jsonb_build_object('mode', 'segmen', 'segmen_dibatalkan', n_seg, 'tiang_dibatalkan', n_tiang);
END $fn$;
GRANT EXECUTE ON FUNCTION public.batalkan_jtm_hp(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- ── 6. Pintu lama: lembar Rintis (HP versi mana pun) ─────────────────────────
-- Satu segmen saja, seperti dulu — tetapi kini dengan aturan hak yang sama.
CREATE OR REPLACE FUNCTION public.batalkan_segmen_rintisan(
  p_segmen_id UUID,
  p_alasan    TEXT,
  p_nama      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r JSONB;
  x JSONB;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi'; END IF;
  r := public._jtm_rencana_batal(p_segmen_id, NULL, p_nama);
  IF r->>'mode' IS DISTINCT FROM 'segmen' THEN
    RAISE EXCEPTION '%', COALESCE(r->>'tolak', 'Segmen ini masuk WO / bukan hasil rintis — pakai "Batalkan / ulangi" di layar segmennya.');
  END IF;
  -- Halangan segmen ini sendiri lebih dulu (pesannya paling tepat).
  SELECT e INTO x FROM jsonb_array_elements(r->'segmen') e WHERE (e->>'kedalaman')::int = 0;
  IF x->>'halangan' IS NOT NULL THEN RAISE EXCEPTION 'Segmen %: %.', x->>'nama', x->>'halangan'; END IF;
  IF jsonb_array_length(r->'segmen') > 1 THEN
    RAISE EXCEPTION 'Segmen % menyambung dari segmen ini — batalkan dari layar segmen (bisa sekaligus beserta sambungannya).',
      (SELECT string_agg(e->>'nama', ', ') FROM jsonb_array_elements(r->'segmen') e WHERE (e->>'kedalaman')::int > 0);
  END IF;
  IF NOT COALESCE((r->>'boleh')::boolean, false) THEN RAISE EXCEPTION '%', r->>'tolak'; END IF;
  RETURN public._batalkan_segmen_inti(p_segmen_id, p_alasan, p_nama);
END $fn$;
GRANT EXECUTE ON FUNCTION public.batalkan_segmen_rintisan(UUID, TEXT, TEXT) TO authenticated;


-- ── 7. Tiang batal keluar dari segmennya ─────────────────────────────────────
-- Hanya 'batal' (salah dititik / salah input). Tiang 'dibongkar' / 'diganti'
-- adalah riwayat nyata di lapangan — keanggotaannya tidak disentuh.
-- Satu pemicu menangkap SEMUA jalan: batalkan_tiang dari HP & web, HP lama,
-- dan fungsi pembatal segmen di atas.
CREATE OR REPLACE FUNCTION public.tiang_batal_lepas_segmen()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.status_hidup = 'batal' AND OLD.status_hidup IS DISTINCT FROM 'batal' THEN
    DELETE FROM public.segmen_tiang WHERE tiang_id = NEW.id;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_tiang_batal_lepas_segmen ON public.tiang;
CREATE TRIGGER trg_tiang_batal_lepas_segmen AFTER UPDATE OF status_hidup ON public.tiang
  FOR EACH ROW EXECUTE FUNCTION public.tiang_batal_lepas_segmen();

-- Yang sudah terlanjur (sekali; menjalankan ulang tidak mengubah apa pun).
-- ⚠ Jumlah tiang & KMS hitungan segmen yang punya tiang batal ikut TURUN ke
-- angka yang benar — termasuk realisasi KMS bulan-bulan lalu di rekap.
DELETE FROM public.segmen_tiang st
 USING public.tiang t
 WHERE t.id = st.tiang_id AND t.status_hidup = 'batal';


-- ── 8. Segmen yatim ──────────────────────────────────────────────────────────
-- Hasil rintis, masih aktif, tetapi tidak punya inspeksi yang hidup dan tidak
-- masuk WO — biasanya karena inspeksinya dibatalkan dari web, yang dulu hanya
-- membatalkan inspeksinya. Di HP ia muncul lagi sebagai "rintisan terbuka".
-- Dihapus lewat batalkan_jtm_hp (aturan & jejak audit yang sama).
CREATE OR REPLACE VIEW public.jtm_segmen_yatim AS
SELECT
  s.id AS segmen_id,
  s.ulp,
  s.penyulang,
  s.nama,
  s.created_at,
  (SELECT count(*) FROM public.segmen_tiang st JOIN public.tiang t ON t.id = st.tiang_id AND t.status_hidup = 'aktif'
    WHERE st.segmen_id = s.id) AS tiang,
  (SELECT m.petugas_nama FROM public.inspeksi_jtm m WHERE m.segmen_id = s.id ORDER BY m.created_at LIMIT 1) AS perintis,
  (SELECT max(m.updated_at) FROM public.inspeksi_jtm m WHERE m.segmen_id = s.id) AS terakhir_dibatalkan
FROM public.segmen s
WHERE s.status = 'aktif' AND s.sumber = 'lapangan'
  AND NOT EXISTS (SELECT 1 FROM public.inspeksi_jtm m WHERE m.segmen_id = s.id AND m.status <> 'Dibatalkan')
  AND NOT EXISTS (SELECT 1 FROM public.wo_inspeksi_item i WHERE i.segmen_id = s.id AND i.status <> 'Dibatalkan')
  AND NOT EXISTS (SELECT 1 FROM public.wo_perabasan_item i WHERE i.segmen_id = s.id AND i.status <> 'Dibatalkan');
GRANT SELECT ON public.jtm_segmen_yatim TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT count(*) FROM segmen_tiang st JOIN tiang t ON t.id = st.tiang_id WHERE t.status_hidup = 'batal';  -- 0
--   SELECT * FROM jtm_segmen_yatim ORDER BY ulp, penyulang;
