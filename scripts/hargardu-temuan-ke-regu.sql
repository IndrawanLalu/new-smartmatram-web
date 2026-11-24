-- =============================================================================
-- Temuan gardu → regu LAIN dari HARGAR (24 Nov 2026). Jalankan SESUDAH
-- hargardu-temuan-wo.sql, inspeksi-gardu-isian.sql, hargardu-tandai-normal.sql.
-- Idempoten.
-- =============================================================================
-- Masalah: "Jadikan WO" di Perlu Perbaikan (/admin/hargardu) memilih "Regu
-- pelaksana" dari semua regu, tetapi regu itu hanya jadi LABEL — temuannya
-- tetap masuk WO Perbaikan / WO Pemeliharaan Gardu, dan di HP muncul di tab
-- "WO temuan" Pemeliharaan Gardu (milik HARGAR, disaring per ULP saja). Temuan
-- pohon yang "diteruskan ke PERABASAN" tidak pernah sampai ke regu perabasan;
-- di luar garansi malah memasukkan gardunya ke WO Pemeliharaan Gardu.
--
-- Sekarang (keputusan user 24 Nov 2026), pola Temuan JTM (jtm-temuan-tugas-regu.sql):
--   • HARGAR → jalur lama (jadikan_wo_temuan_gardu), tidak berubah.
--   • PERABASAN → baris `inspeksi_pohon` (tugas pohon HP), regu wajib (team_name).
--   • Regu lain (HARJAR, K3, YANGU, PDKB, …) → baris `inspeksi` (tugas HP per
--     peran; K3 wajib regu).
--   • Satu tugas per GARDU (temuan-temuan gardu yang sama dikerjakan sekali
--     datang). Tidak masuk WO bulanan, tidak dihitung realisasi Pemeliharaan Gardu.
--   • tindak_lanjut_gardu jalur 'tugas' → baris Perlu Perbaikan "Sudah
--     ditugaskan ke <regu>"; saat tugasnya Selesai → "Sudah dikerjakan"
--     (pemicu di inspeksi/inspeksi_pohon). Dibatalkan/dihapus → kembali "Belum".
--
--   1. Kolom tugas di tindak_lanjut_gardu + jalur 'tugas'
--   2. teruskan_temuan_gardu(...)
--   3. Pemicu: status tugas → tindak_lanjut_gardu
--   4. gardu_perlu_perbaikan: tambalan definisi hidup (jalur 'tugas')
-- =============================================================================


-- ── 1. Kolom tugas ───────────────────────────────────────────────────────────
ALTER TABLE public.tindak_lanjut_gardu
  ADD COLUMN IF NOT EXISTS tugas_tabel TEXT,
  ADD COLUMN IF NOT EXISTS tugas_id    UUID,
  ADD COLUMN IF NOT EXISTS tugas_regu  TEXT;
COMMENT ON COLUMN public.tindak_lanjut_gardu.tugas_id IS
  'Jalur tugas: id baris inspeksi / inspeksi_pohon (tugas_tabel) yang mengerjakan temuan ini (hargardu-temuan-ke-regu.sql).';
CREATE INDEX IF NOT EXISTS tindak_lanjut_gardu_tugas_idx ON public.tindak_lanjut_gardu (tugas_id) WHERE tugas_id IS NOT NULL;
-- Web membaca nama regu penerima (tugas_regu) langsung dari tabel ini.
GRANT SELECT ON public.tindak_lanjut_gardu TO authenticated;

ALTER TABLE public.tindak_lanjut_gardu DROP CONSTRAINT IF EXISTS tindak_lanjut_gardu_jalur_valid;
ALTER TABLE public.tindak_lanjut_gardu ADD CONSTRAINT tindak_lanjut_gardu_jalur_valid
  CHECK (jalur IN ('wo_tugas', 'wo_har', 'perbaikan', 'normal', 'tugas'));
COMMENT ON COLUMN public.tindak_lanjut_gardu.jalur IS
  'wo_tugas = WO "Tindak Lanjut Gardu" lama · wo_har = WO Pemeliharaan Gardu (luar garansi) · perbaikan = WO Perbaikan (dalam garansi) · normal = ditandai normal oleh admin · tugas = diteruskan ke regu lain (inspeksi/inspeksi_pohon).';


-- ── 2. Teruskan ke regu ──────────────────────────────────────────────────────
-- p_temuan: baris Perlu Perbaikan, bentuk sama dengan jadikan_wo_temuan_gardu.
-- p_peran : kode peran pelaksana (bukan HARGAR). p_regu: nama regu (PERABASAN/K3).
CREATE OR REPLACE FUNCTION public.teruskan_temuan_gardu(
  p_temuan JSONB, p_peran TEXT, p_regu TEXT DEFAULT NULL, p_catatan TEXT DEFAULT NULL, p_oleh TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_peran  TEXT := upper(btrim(COALESCE(p_peran, '')));
  v_regu   TEXT := NULLIF(btrim(COALESCE(p_regu, '')), '');
  v_cat    TEXT := NULLIF(btrim(COALESCE(p_catatan, '')), '');
  v_pohon  BOOLEAN;
  g        RECORD;
  x        JSONB;
  gd       RECORD;
  v_tugas  UUID;
  v_urai   TEXT;
  v_prio   TEXT;
  v_foto   TEXT;
  v_tgl    TEXT;
  n_tugas  INT := 0;
  n_temuan INT := 0;
  ditolak  JSONB := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p_temuan, 'null'::jsonb)) <> 'array' OR jsonb_array_length(p_temuan) = 0 THEN
    RAISE EXCEPTION 'Belum ada temuan yang dipilih.';
  END IF;
  IF v_peran = 'HARGAR' THEN
    RAISE EXCEPTION 'Regu HARGAR lewat Jadikan WO (WO Perbaikan / WO Pemeliharaan Gardu).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE upper(code) = v_peran AND is_eksekutor) THEN
    RAISE EXCEPTION 'Regu % tidak dikenal atau bukan regu pelaksana.', COALESCE(p_peran, '-');
  END IF;
  SELECT code INTO v_peran FROM public.roles WHERE upper(code) = v_peran LIMIT 1;  -- ejaan resmi
  v_pohon := upper(v_peran) = 'PERABASAN';
  IF upper(v_peran) NOT IN ('PERABASAN', 'K3') THEN
    v_regu := NULL;  -- peran lain menerima tugas per peran; regu tidak dipakai HP
  ELSIF v_regu IS NULL THEN
    RAISE EXCEPTION 'Pilih regu %: tugasnya diterima HP per regu, bukan per peran.', v_peran;
  END IF;

  FOR g IN
    SELECT upper(btrim(t->>'ulp')) AS ulp, btrim(t->>'gardu_kode') AS kode, jsonb_agg(t) AS isi
    FROM jsonb_array_elements(p_temuan) t
    GROUP BY 1, 2
  LOOP
    PERFORM public.wajib_boleh_ulp(g.ulp);
    -- Dua admin menekan bersamaan tidak boleh melahirkan dua tugas.
    PERFORM pg_advisory_xact_lock(hashtext(concat_ws('|', 'tugas-gardu', g.ulp, upper(g.kode))));

    IF v_regu IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.petugas pt
      WHERE upper(COALESCE(pt.group_name, '')) = upper(v_peran)
        AND upper(COALESCE(pt.ulp, '')) = g.ulp
        AND pt.nama = v_regu
        AND lower(COALESCE(pt.status, 'aktif')) = 'aktif'
    ) THEN
      RAISE EXCEPTION 'Regu "%" tidak terdaftar aktif di grup % ULP %.', v_regu, v_peran, g.ulp;
    END IF;

    -- Temuan yang masih di tangan regu lain dilewati (Belum bisa boleh diulang).
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(g.isi) t
      JOIN public.tindak_lanjut_gardu tl
        ON upper(tl.gardu_kode) = upper(g.kode) AND upper(tl.ulp) = g.ulp
       AND tl.item_kode = t->>'item_kode' AND tl.bagian = COALESCE(NULLIF(t->>'bagian', ''), '-')
      WHERE tl.status = 'Di-WO'
    ) THEN
      ditolak := ditolak || jsonb_build_array(jsonb_build_object('objek', g.kode, 'sebab', 'sebagian temuan sudah di-WO / ditugaskan'));
      CONTINUE;
    END IF;

    SELECT x2.nama, x2.alamat, x2.feeder, x2.lat, x2.lng INTO gd
    FROM public.gardu x2
    WHERE upper(x2.kode) = upper(g.kode) AND upper(x2.ulp) = g.ulp
    LIMIT 1;

    SELECT string_agg(DISTINCT (t->>'item_nama') || COALESCE(': ' || (t->>'nilai_label'), ''), '; '),
           -- Prioritas tertinggi di antara temuan gardu ini (Inspeksi Gardu: Urgent/Rawan/Biasa).
           CASE WHEN bool_or(t->>'prioritas' = 'Urgent') THEN 'Urgent'
                WHEN bool_or(t->>'prioritas' = 'Rawan') THEN 'Rawan' ELSE 'Biasa' END,
           min(NULLIF(t->>'ditemukan_pada', ''))
    INTO v_urai, v_prio, v_tgl
    FROM jsonb_array_elements(g.isi) t;

    -- Foto temuan pertama: Inspeksi Gardu dari sumbernya, lainnya dari layar.
    SELECT COALESCE((SELECT it.foto_url[1] FROM public.inspeksi_gardu_temuan it WHERE it.id = NULLIF(t->>'temuan_id', '')::uuid),
                    NULLIF(t->>'foto_url', ''))
    INTO v_foto
    FROM jsonb_array_elements(g.isi) t
    WHERE COALESCE((SELECT it.foto_url[1] FROM public.inspeksi_gardu_temuan it WHERE it.id = NULLIF(t->>'temuan_id', '')::uuid),
                   NULLIF(t->>'foto_url', '')) IS NOT NULL
    LIMIT 1;

    v_tgl := to_char((COALESCE(v_tgl::timestamptz, now()) AT TIME ZONE 'Asia/Makassar')::date, 'YYYY-MM-DD');

    IF v_pohon THEN
      INSERT INTO public.inspeksi_pohon (
        deskripsi, lokasi, ulp, penyulang,
        inspektor, nama_inspektor, inspektor_or_petugas,
        koordinat, foto_sebelum_url,
        status, eksekutor, assigned_at, tgl_inspeksi,
        tingkat_risiko, category, keterangan, source, updated_by
      ) VALUES (
        left('Temuan gardu ' || g.kode || ': ' || COALESCE(v_urai, '-'), 500),
        concat_ws(' · ', 'Gardu ' || g.kode, gd.nama, gd.alamat),
        g.ulp, gd.feeder,
        p_oleh, p_oleh, p_oleh,
        CASE WHEN gd.lat IS NOT NULL AND gd.lng IS NOT NULL THEN gd.lat || ', ' || gd.lng END,
        v_foto,
        -- Eksekutor & regu diisi lewat UPDATE di bawah: pemicu notifikasi HP
        -- menyala saat UPDATE yang mengisinya, bukan saat INSERT.
        'Ditugaskan', '', now(), v_tgl,
        CASE v_prio WHEN 'Urgent' THEN 'Sangat Tinggi' WHEN 'Rawan' THEN 'Tinggi' ELSE 'Sedang' END,
        CASE v_prio WHEN 'Urgent' THEN 'Urgent' ELSE 'Normal' END,
        v_cat, 'temuan_gardu', p_oleh
      ) RETURNING id INTO v_tugas;
      UPDATE public.inspeksi_pohon SET eksekutor = v_peran, team_name = v_regu WHERE id = v_tugas;
    ELSE
      INSERT INTO public.inspeksi (
        category, deskripsi, temuan, lokasi, ulp, penyulang,
        inspektor, nama_inspektor, inspektor_or_petugas,
        koordinat, foto_sebelum_url, image_url,
        status, eksekutor, assigned_at, tgl_inspeksi,
        keterangan, source, updated_by
      ) VALUES (
        CASE v_prio WHEN 'Urgent' THEN 'Urgent' ELSE 'Normal' END,
        left('Temuan gardu ' || g.kode || ': ' || COALESCE(v_urai, '-'), 500),
        left(COALESCE(v_urai, 'Temuan gardu'), 200),
        concat_ws(' · ', 'Gardu ' || g.kode, gd.nama, gd.alamat),
        g.ulp, gd.feeder,
        p_oleh, p_oleh, p_oleh,
        CASE WHEN gd.lat IS NOT NULL AND gd.lng IS NOT NULL THEN gd.lat || ', ' || gd.lng END,
        v_foto, v_foto,
        'Ditugaskan', '', now(), v_tgl,
        v_cat, 'temuan_gardu', p_oleh
      ) RETURNING id INTO v_tugas;
      UPDATE public.inspeksi SET eksekutor = v_peran, team_name = v_regu WHERE id = v_tugas;
    END IF;
    n_tugas := n_tugas + 1;

    FOR x IN SELECT * FROM jsonb_array_elements(g.isi) LOOP
      INSERT INTO public.tindak_lanjut_gardu AS tl
        (gardu_kode, ulp, item_kode, bagian, wo_item_id, ditugaskan_pada, ditugaskan_oleh, catatan,
         jalur, status, sumber, temuan_id, item_nama, nilai_label, uraian, foto_url, prioritas, ditemukan_pada,
         perbaikan_id, wo_har_item_id, har_pemeliharaan_id, har_hasil,
         dikerjakan_at, dikerjakan_oleh, foto_sesudah_url, hasil_catatan,
         tugas_tabel, tugas_id, tugas_regu)
      VALUES (g.kode, g.ulp, x->>'item_kode', COALESCE(NULLIF(x->>'bagian', ''), '-'), NULL, now(), p_oleh, v_cat,
              'tugas', 'Di-WO', x->>'sumber', NULLIF(x->>'temuan_id', '')::uuid, x->>'item_nama', x->>'nilai_label', x->>'catatan',
              COALESCE((SELECT it.foto_url[1] FROM public.inspeksi_gardu_temuan it WHERE it.id = NULLIF(x->>'temuan_id', '')::uuid),
                       NULLIF(x->>'foto_url', '')),
              NULLIF(x->>'prioritas', ''), NULLIF(x->>'ditemukan_pada', '')::timestamptz,
              NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
              CASE WHEN v_pohon THEN 'inspeksi_pohon' ELSE 'inspeksi' END, v_tugas,
              concat_ws(' · ', v_peran, v_regu))
      ON CONFLICT (gardu_kode, ulp, item_kode, bagian) DO UPDATE SET
        wo_item_id = NULL, ditugaskan_pada = now(), ditugaskan_oleh = EXCLUDED.ditugaskan_oleh, catatan = EXCLUDED.catatan,
        jalur = 'tugas', status = 'Di-WO', sumber = EXCLUDED.sumber, temuan_id = EXCLUDED.temuan_id,
        item_nama = EXCLUDED.item_nama, nilai_label = EXCLUDED.nilai_label, uraian = EXCLUDED.uraian,
        foto_url = EXCLUDED.foto_url, prioritas = EXCLUDED.prioritas, ditemukan_pada = EXCLUDED.ditemukan_pada,
        perbaikan_id = NULL, wo_har_item_id = NULL, har_pemeliharaan_id = NULL, har_hasil = NULL,
        dikerjakan_at = NULL, dikerjakan_oleh = NULL, foto_sesudah_url = NULL, hasil_catatan = NULL,
        tugas_tabel = EXCLUDED.tugas_tabel, tugas_id = EXCLUDED.tugas_id, tugas_regu = EXCLUDED.tugas_regu;
      n_temuan := n_temuan + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('tugas', n_tugas, 'temuan', n_temuan, 'ditolak', ditolak,
                            'regu', concat_ws(' · ', v_peran, v_regu));
END $fn$;
REVOKE ALL ON FUNCTION public.teruskan_temuan_gardu(JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teruskan_temuan_gardu(JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ── 3. Status tugas → tindak_lanjut_gardu ────────────────────────────────────
-- Selesai → Dikerjakan (foto sesudah dari tugasnya); keluar dari Selesai
-- (dibuka lagi) → kembali Di-WO; Batal / dihapus → baris tindak lanjut dibuang
-- sehingga temuannya "Belum ditugaskan" lagi.
CREATE OR REPLACE FUNCTION public._tugas_temuan_gardu_ikut()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- Dua IF terpisah: NEW tidak terisi pada DELETE.
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.tindak_lanjut_gardu
    WHERE tugas_id = OLD.id AND tugas_tabel = TG_TABLE_NAME AND jalur = 'tugas' AND status = 'Di-WO';
    RETURN NULL;
  END IF;
  IF NEW.status IN ('Batal', 'Dibatalkan') THEN
    DELETE FROM public.tindak_lanjut_gardu
    WHERE tugas_id = OLD.id AND tugas_tabel = TG_TABLE_NAME AND jalur = 'tugas' AND status = 'Di-WO';
    RETURN NULL;
  END IF;

  IF NEW.status = 'Selesai' THEN
    UPDATE public.tindak_lanjut_gardu
    SET status = 'Dikerjakan', dikerjakan_at = now(),
        dikerjakan_oleh = COALESCE(NULLIF(NEW.team_name, ''), NULLIF(NEW.eksekutor, '')),
        foto_sesudah_url = NEW.foto_sesudah_url
    WHERE tugas_id = NEW.id AND tugas_tabel = TG_TABLE_NAME AND jalur = 'tugas';
    -- Temuan Inspeksi Gardu ikut tertutup (seperti WO Perbaikan / Tandai normal).
    UPDATE public.inspeksi_gardu_temuan it
    SET status_tl = 'Selesai', selesai_at = now(),
        selesai_oleh = COALESCE(NULLIF(NEW.team_name, ''), NULLIF(NEW.eksekutor, '')),
        selesai_catatan = 'Dikerjakan regu ' || concat_ws(' · ', NULLIF(NEW.eksekutor, ''), NULLIF(NEW.team_name, ''))
    FROM public.tindak_lanjut_gardu tl
    WHERE tl.tugas_id = NEW.id AND tl.tugas_tabel = TG_TABLE_NAME AND tl.temuan_id = it.id AND it.status_tl = 'Terbuka';
  ELSIF OLD.status = 'Selesai' THEN
    UPDATE public.tindak_lanjut_gardu
    SET status = 'Di-WO', dikerjakan_at = NULL, dikerjakan_oleh = NULL, foto_sesudah_url = NULL
    WHERE tugas_id = NEW.id AND tugas_tabel = TG_TABLE_NAME AND jalur = 'tugas';
  END IF;
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION public._tugas_temuan_gardu_ikut() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tugas_temuan_gardu_ubah ON public.inspeksi;
CREATE TRIGGER tugas_temuan_gardu_ubah AFTER UPDATE OF status ON public.inspeksi
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND OLD.source = 'temuan_gardu')
  EXECUTE FUNCTION public._tugas_temuan_gardu_ikut();
DROP TRIGGER IF EXISTS tugas_temuan_gardu_hapus ON public.inspeksi;
CREATE TRIGGER tugas_temuan_gardu_hapus AFTER DELETE ON public.inspeksi
  FOR EACH ROW WHEN (OLD.source = 'temuan_gardu')
  EXECUTE FUNCTION public._tugas_temuan_gardu_ikut();

DROP TRIGGER IF EXISTS tugas_temuan_gardu_ubah ON public.inspeksi_pohon;
CREATE TRIGGER tugas_temuan_gardu_ubah AFTER UPDATE OF status ON public.inspeksi_pohon
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND OLD.source = 'temuan_gardu')
  EXECUTE FUNCTION public._tugas_temuan_gardu_ikut();
DROP TRIGGER IF EXISTS tugas_temuan_gardu_hapus ON public.inspeksi_pohon;
CREATE TRIGGER tugas_temuan_gardu_hapus AFTER DELETE ON public.inspeksi_pohon
  FOR EACH ROW WHEN (OLD.source = 'temuan_gardu')
  EXECUTE FUNCTION public._tugas_temuan_gardu_ikut();


-- ── 4. Perlu Perbaikan: jalur 'tugas' yang sudah dikerjakan ikut keluar ─────
-- TAMBALAN pada definisi HIDUP (teknisaplikasi.md 23.7), bukan menulis ulang
-- dari berkas: cabang Pemeliharaan Gardu mengeluarkan temuan yang Dikerjakan
-- lewat perbaikan/normal sesudah pemeliharaan terakhir — 'tugas' ditambahkan.
-- Penanda harus ketemu TEPAT SEKALI; kalau tidak, berhenti tanpa mengubah apa pun.
-- (Nama regu tidak ditambahkan ke view: web membacanya dari tindak_lanjut_gardu.)
DO $patch$
DECLARE
  def   TEXT := pg_get_viewdef('public.gardu_perlu_perbaikan'::regclass, true);
  lama  TEXT := 'ARRAY[''perbaikan''::text, ''normal''::text]';
  baru  TEXT := 'ARRAY[''perbaikan''::text, ''normal''::text, ''tugas''::text]';
  n     INT;
BEGIN
  IF position(baru IN def) > 0 THEN
    RAISE NOTICE 'gardu_perlu_perbaikan sudah mengenal jalur tugas — dilewati.';
    RETURN;
  END IF;
  n := (length(def) - length(replace(def, lama, ''))) / length(lama);
  IF n <> 1 THEN
    RAISE EXCEPTION 'Penanda % ketemu % kali di gardu_perlu_perbaikan (harus 1) — view TIDAK diubah. Kirim hasil pg_get_viewdef ke pengembang.', lama, n;
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.gardu_perlu_perbaikan AS ' || replace(def, lama, baru);
END $patch$;
GRANT SELECT ON public.gardu_perlu_perbaikan TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ── Periksa (hanya baca) ──────────────────────────────────────────────────────
-- 1) fungsi & pemicu terpasang (harus 1 dan 4):
--   SELECT count(*) FROM pg_proc WHERE proname = 'teruskan_temuan_gardu';
--   SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'tugas_temuan_gardu_%';
-- 2) view mengenal jalur tugas (harus true):
--   SELECT pg_get_viewdef('gardu_perlu_perbaikan'::regclass, true) LIKE '%''tugas''::text%';
