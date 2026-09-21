-- =============================================================================
-- Master Segmen — panjang yang boleh diketik, dan daftar acuan untuk WO
-- Jalankan SESUDAH `gabung-penyulang.sql`. Idempoten.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
-- WO perabasan bersatuan SEGMEN, dan segmennya belum terbentuk. Diperiksa
-- 21 Sep 2026: baru ada 8 segmen dari 81 penyulang, dan 6 di antaranya masih
-- berupa "GI X - UJUNG" seluruh penyulang. Menunggu inspeksi JTM menelusuri
-- semuanya berarti WO perabasan tidak jalan berbulan-bulan.
--
-- Jembatannya: panjang segmen BOLEH DIKETIK selama tiangnya belum tertelusuri.
-- Begitu tiang masuk, hitungan dari bentang mengambil alih sendiri — angka
-- ketikannya tidak dihapus, hanya berhenti dipakai.
--
-- ── SATU ATURAN, DITULIS SEKALI ─────────────────────────────────────────────
--   Panjang dihitung dari tiang. Kalau segmen belum punya bentang, dipakai
--   angka ketikan. Hitungan selalu menang.
--
-- Dan yang sama pentingnya: layar HARUS bisa membedakan keduanya. Laporan yang
-- mencampur angka ukuran dengan angka kiraan, tanpa ada yang bisa memilahnya,
-- lebih buruk daripada laporan yang kosong — yang kosong masih jujur.
-- Karena itu `panjang_dari` ikut disediakan, bukan cuma angkanya.
-- =============================================================================


-- ── 1. Panjang ketikan ───────────────────────────────────────────────────────

ALTER TABLE public.segmen
  ADD COLUMN IF NOT EXISTS panjang_manual_km NUMERIC(8,3);

-- Ruas JTM 200 km tidak ada di Lombok. Yang sepanjang itu selalu salah ketik —
-- koma yang tertinggal, atau meter yang diketik sebagai kilometer.
ALTER TABLE public.segmen DROP CONSTRAINT IF EXISTS segmen_panjang_manual_wajar;
ALTER TABLE public.segmen ADD CONSTRAINT segmen_panjang_manual_wajar
  CHECK (panjang_manual_km IS NULL OR (panjang_manual_km > 0 AND panjang_manual_km <= 200));

COMMENT ON COLUMN public.segmen.panjang_manual_km IS
  'Panjang yang DIKETIK admin, dipakai hanya selama segmen belum punya bentang tiang. Tidak pernah dihapus saat hitungan mengambil alih — supaya bisa dibandingkan kalau hitungannya kelak terlihat janggal.';


-- ── 2. Membaca label titik kembali jadi jenis + nama ─────────────────────────
-- Kebalikan `segmen_label_titik`. Dipakai impor supaya admin cukup menempel
-- nama segmen sebagaimana diucapkan orang lapangan — 'GI AMPENAN - REC. BRIMOB'
-- — bukan mengisi empat kolom jenis dan nama satu per satu.
--
-- Jenis yang tidak dikenali jatuh ke 'PENG'. Itu pilihan yang disengaja: PENG
-- adalah satu-satunya jenis yang TIDAK memotong jaringan (lihat
-- `segmen_memotong`), jadi tebakan yang salah tidak pernah membuat sistem
-- mengira ada alat hubung di tempat yang sebenarnya tidak ada.

CREATE OR REPLACE FUNCTION public.pisah_label_titik(p_label TEXT)
RETURNS TABLE (jenis TEXT, nama TEXT)
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  t TEXT := upper(btrim(regexp_replace(COALESCE(p_label, ''), '\s+', ' ', 'g')));
  k TEXT;
BEGIN
  IF t = '' OR t = 'UJUNG' THEN
    RETURN QUERY SELECT 'UJUNG'::TEXT, ''::TEXT;
    RETURN;
  END IF;

  -- Bertitik: 'REC. BRIMOB', 'LBS PASAR', 'PENG. SEKOLAH', 'PMT 3'
  FOREACH k IN ARRAY ARRAY['REC', 'LBS', 'PENG', 'PMT'] LOOP
    IF t ~ ('^' || k || '\.?\s') THEN
      RETURN QUERY SELECT k, btrim(regexp_replace(t, '^' || k || '\.?\s+', ''));
      RETURN;
    END IF;
  END LOOP;

  -- Berspasi: 'GI AMPENAN', 'PLTD TALIWANG'
  FOREACH k IN ARRAY ARRAY['GI', 'PLTD'] LOOP
    IF t ~ ('^' || k || '\s') THEN
      RETURN QUERY SELECT k, btrim(regexp_replace(t, '^' || k || '\s+', ''));
      RETURN;
    END IF;
  END LOOP;

  RETURN QUERY SELECT 'PENG'::TEXT, t;
END $fn$;

COMMENT ON FUNCTION public.pisah_label_titik IS
  'Kebalikan segmen_label_titik: membaca "REC. BRIMOB" jadi (REC, BRIMOB). Yang tidak dikenali jadi PENG — jenis yang tidak memotong jaringan, jadi tebakan salah tidak pernah mengarang alat hubung.';


-- ── 3. Panjang: hitungan atau ketikan ────────────────────────────────────────
-- Kolom lama dipertahankan persis urutan dan artinya; yang baru ditambahkan di
-- belakang. `panjang_km` TETAP berarti "dihitung dari bentang" supaya layar
-- lama tidak diam-diam berubah arti — yang dipakai layar baru
-- `panjang_pakai_km` beserta `panjang_dari`.

CREATE OR REPLACE VIEW public.segmen_panjang AS
WITH anggota AS (
  SELECT segmen_id, count(*) AS jumlah_tiang
  FROM public.segmen_tiang
  GROUP BY segmen_id
), gawang AS (
  SELECT
    sa.segmen_id,
    count(*)                                       AS jumlah_gawang,
    sum(g.panjang_m)                               AS panjang_m,
    count(*) FILTER (WHERE g.panjang_m IS NULL)    AS gawang_tanpa_titik,
    max(g.panjang_m)                               AS gawang_terpanjang_m
  FROM public.tiang_gawang_jtm g
  JOIN public.segmen_tiang sa ON sa.tiang_id = g.tiang_id
  JOIN public.segmen_tiang si ON si.segmen_id = sa.segmen_id AND si.tiang_id = g.induk_id
  GROUP BY sa.segmen_id
)
SELECT
  s.id AS segmen_id,
  s.nama,
  s.penyulang,
  s.ulp,
  s.status,
  s.induk_segmen_id,
  COALESCE(a.jumlah_tiang, 0)                        AS jumlah_tiang,
  COALESCE(gw.jumlah_gawang, 0)                      AS jumlah_gawang,
  round((COALESCE(gw.panjang_m, 0) / 1000)::numeric, 3) AS panjang_km,
  COALESCE(gw.gawang_tanpa_titik, 0)                 AS gawang_tanpa_titik,
  round(gw.gawang_terpanjang_m::numeric, 1)          AS gawang_terpanjang_m,
  (SELECT count(*)
     FROM public.segmen_tiang x
     JOIN public.tiang_jtm_bersama b ON b.tiang_id = x.tiang_id
    WHERE x.segmen_id = s.id)                        AS tiang_bersama,

  -- ── Baru ──
  s.sumber,
  s.panjang_manual_km,

  -- Hitungan MENANG. Bukan karena lebih besar atau lebih kecil, tapi karena
  -- dia berasal dari titik koordinat yang benar-benar diambil orang di lapangan.
  CASE
    WHEN COALESCE(gw.jumlah_gawang, 0) > 0
      THEN round((COALESCE(gw.panjang_m, 0) / 1000)::numeric, 3)
    ELSE s.panjang_manual_km
  END                                                AS panjang_pakai_km,

  CASE
    WHEN COALESCE(gw.jumlah_gawang, 0) > 0     THEN 'hitungan'
    WHEN s.panjang_manual_km IS NOT NULL       THEN 'ketikan'
    ELSE                                            'kosong'
  END                                                AS panjang_dari
FROM public.segmen s
LEFT JOIN anggota a ON a.segmen_id = s.id
LEFT JOIN gawang gw ON gw.segmen_id = s.id;

COMMENT ON VIEW public.segmen_panjang IS
  'Panjang tiap segmen. panjang_km = dihitung dari bentang (arti lama, tidak berubah). panjang_pakai_km = hitungan kalau ada, ketikan kalau belum — dan panjang_dari menyebut yang mana, supaya laporan tidak mencampur angka ukuran dengan angka kiraan tanpa ada yang bisa memilahnya.';


-- ── 4. Master Segmen ─────────────────────────────────────────────────────────
-- Daftar acuan yang melayani inspeksi JTM DAN perabasan. Yang membuatnya
-- berguna bukan daftarnya, melainkan UMURNYA: ruas yang paling lama tidak
-- disentuh naik sendiri ke atas, dan WO berikutnya tinggal mencentang dari situ
-- alih-alih diingat-ingat orang.
--
-- "Terakhir dirabas" BELUM ADA di sini, dan sengaja tidak dikarang. Sumbernya
-- baru lahir bersama modul WO perabasan; kolom kosong yang terlihat seperti
-- data akan terbaca sebagai "belum pernah dirabas", dan itu pernyataan yang
-- tidak bisa dipertanggungjawabkan sekarang.

CREATE OR REPLACE VIEW public.master_segmen AS
SELECT
  sp.segmen_id,
  sp.nama,
  sp.penyulang,
  sp.ulp,
  sp.status,
  sp.sumber,
  sp.jumlah_tiang,
  sp.jumlah_gawang,
  sp.panjang_km,
  sp.panjang_manual_km,
  sp.panjang_pakai_km,
  sp.panjang_dari,
  sp.tiang_bersama,
  s.catatan,
  s.created_at,

  ins.terakhir AS terakhir_inspeksi,
  CASE WHEN ins.terakhir IS NULL THEN NULL
       ELSE floor(EXTRACT(EPOCH FROM (now() - ins.terakhir)) / 2592000)::INT
  END AS umur_inspeksi_bulan,
  ins.sedang_berjalan AS inspeksi_berjalan
FROM public.segmen_panjang sp
JOIN public.segmen s ON s.id = sp.segmen_id
LEFT JOIN LATERAL (
  SELECT
    max(COALESCE(m.tgl_selesai, m.tgl_mulai))
      FILTER (WHERE m.status = 'Diverifikasi')                       AS terakhir,
    count(*) FILTER (WHERE m.status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai')) > 0
                                                                     AS sedang_berjalan
  FROM public.inspeksi_jtm m
  WHERE m.segmen_id = sp.segmen_id
) ins ON true;

COMMENT ON VIEW public.master_segmen IS
  'Daftar acuan segmen untuk WO inspeksi JTM dan perabasan. umur_inspeksi_bulan dihitung dari inspeksi yang SUDAH DIVERIFIKASI saja — yang masih diproses belum boleh menurunkan umurnya, kalau tidak ruas yang pekerjaannya mangkrak terlihat seperti baru saja disentuh.';


-- ── 5. Impor segmen per penyulang ────────────────────────────────────────────
-- Penyulangnya DIPILIH dari master, bukan diketik. Yang belum terdaftar tidak
-- bisa dipilih sama sekali — di situlah ikatan gardu–penyulang–segmen
-- benar-benar ditegakkan, bukan di komentar.
--
-- `p_baris` = [{"awal": "...", "akhir": "...", "km": 2.03}, ...]
--
-- Segmen yang lahir dari lapangan TIDAK PERNAH ditimpa. Impor cuma boleh
-- menambah; yang sudah ditelusuri regu lebih tahu daripada tempelan Excel.

CREATE OR REPLACE FUNCTION public.impor_segmen(
  p_penyulang TEXT,
  p_baris     JSONB,
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  nama_p   TEXT := regexp_replace(upper(btrim(COALESCE(p_penyulang, ''))), '\s+', ' ', 'g');
  unit     TEXT;
  b        JSONB;
  awal     TEXT;
  akhir    TEXT;
  km       NUMERIC;
  ta       RECORD;
  tb       RECORD;
  label    TEXT;
  dibuat   INT := 0;
  dilewati JSONB := '[]'::jsonb;
BEGIN
  SELECT ulp INTO unit FROM public.penyulang_ref WHERE upper(penyulang) = nama_p;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Penyulang "%" belum ada di Master Penyulang. Daftarkan dulu di sana — segmen tanpa induk yang sah tidak bisa dipakai jadi WO.', nama_p;
  END IF;
  IF COALESCE(unit, '') = '' THEN
    RAISE EXCEPTION 'Penyulang "%" belum punya ULP di master. Lengkapi dulu.', nama_p;
  END IF;

  PERFORM public.penyulang_wajib_boleh(unit);

  FOR b IN SELECT * FROM jsonb_array_elements(COALESCE(p_baris, '[]'::jsonb)) LOOP
    awal  := btrim(COALESCE(b ->> 'awal', ''));
    akhir := btrim(COALESCE(b ->> 'akhir', ''));
    BEGIN
      km := NULLIF(b ->> 'km', '')::NUMERIC;
    EXCEPTION WHEN others THEN
      km := NULL;
    END;

    IF awal = '' OR akhir = '' THEN
      dilewati := dilewati || jsonb_build_object(
        'baris', b, 'sebab', 'Titik awal atau titik akhir kosong.');
      CONTINUE;
    END IF;

    IF km IS NOT NULL AND (km <= 0 OR km > 200) THEN
      dilewati := dilewati || jsonb_build_object(
        'baris', b, 'sebab', format('Panjang %s km tidak wajar. Ruas JTM sepanjang itu tidak ada — biasanya koma yang tertinggal.', km));
      CONTINUE;
    END IF;

    SELECT * INTO ta FROM public.pisah_label_titik(awal);
    SELECT * INTO tb FROM public.pisah_label_titik(akhir);
    label := public.segmen_label_titik(ta.jenis, ta.nama) || ' - ' ||
             public.segmen_label_titik(tb.jenis, tb.nama);

    -- Sudah ada? Panjangnya boleh dilengkapi, tapi HANYA kalau segmen itu
    -- belum punya panjang ketikan dan bukan lahir dari lapangan. Menimpa yang
    -- sudah ada akan membuat tempelan Excel kedua diam-diam menghapus koreksi
    -- yang dikerjakan orang di antara dua tempelan itu.
    IF EXISTS (SELECT 1 FROM public.segmen
               WHERE upper(penyulang) = nama_p AND nama = label) THEN
      IF km IS NOT NULL THEN
        UPDATE public.segmen
        SET panjang_manual_km = km, updated_at = now()
        WHERE upper(penyulang) = nama_p AND nama = label
          AND sumber <> 'lapangan' AND panjang_manual_km IS NULL;
      END IF;
      dilewati := dilewati || jsonb_build_object(
        'baris', b, 'sebab', format('Segmen "%s" sudah ada — tidak ditimpa.', label));
      CONTINUE;
    END IF;

    INSERT INTO public.segmen (
      penyulang, ulp,
      titik_awal_jenis, titik_awal_nama,
      titik_akhir_jenis, titik_akhir_nama,
      sumber, panjang_manual_km, catatan
    ) VALUES (
      nama_p, unit,
      ta.jenis, ta.nama,
      tb.jenis, tb.nama,
      'impor', km,
      CASE WHEN p_oleh IS NULL THEN NULL ELSE 'Diimpor oleh ' || p_oleh END
    );
    dibuat := dibuat + 1;
  END LOOP;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('segmen', nama_p, unit, 'impor', NULL,
          jsonb_build_object('dibuat', dibuat, 'dilewati', jsonb_array_length(dilewati)),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object(
    'penyulang', nama_p, 'ulp', unit,
    'dibuat', dibuat,
    'dilewati', dilewati);
END $fn$;


-- ── 6. Membetulkan panjang ketikan satu segmen ───────────────────────────────
-- Lewat fungsi, bukan UPDATE langsung: yang perlu dijaga bukan bentuk angkanya
-- (itu sudah diurus CHECK), melainkan bahwa segmen yang panjangnya SUDAH
-- dihitung dari tiang tidak diam-diam diberi angka ketikan yang lalu tidak
-- pernah terpakai — dan orang yang mengetiknya mengira sudah membetulkan sesuatu.

CREATE OR REPLACE FUNCTION public.ubah_panjang_manual_segmen(
  p_segmen_id UUID,
  p_km        NUMERIC,
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  sp RECORD;
BEGIN
  SELECT * INTO sp FROM public.segmen_panjang WHERE segmen_id = p_segmen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen tidak ditemukan'; END IF;

  PERFORM public.penyulang_wajib_boleh(sp.ulp);

  IF p_km IS NOT NULL AND (p_km <= 0 OR p_km > 200) THEN
    RAISE EXCEPTION 'Panjang % km tidak wajar. Ruas JTM sepanjang itu tidak ada.', p_km;
  END IF;

  UPDATE public.segmen
  SET panjang_manual_km = p_km, updated_at = now()
  WHERE id = p_segmen_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('segmen', sp.nama, sp.ulp, 'panjang_manual_km',
          to_jsonb(sp.panjang_manual_km), to_jsonb(p_km),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object(
    'segmen_id', p_segmen_id,
    'panjang_manual_km', p_km,
    -- Dikembalikan apa adanya supaya layar bisa mengatakannya: angka yang baru
    -- diketik TIDAK dipakai selama segmen ini sudah punya bentang tiang.
    'dipakai', sp.jumlah_gawang = 0);
END $fn$;


-- ── 7. Hak akses ─────────────────────────────────────────────────────────────

GRANT SELECT  ON public.segmen_panjang               TO authenticated;
GRANT SELECT  ON public.master_segmen                TO authenticated;
GRANT EXECUTE ON FUNCTION public.pisah_label_titik   TO authenticated;
GRANT EXECUTE ON FUNCTION public.impor_segmen        TO authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_panjang_manual_segmen TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Segmen beserta asal panjangnya — per 21 Sep 2026 baru 8 baris:
--      SELECT penyulang, nama, sumber, panjang_pakai_km, panjang_dari,
--             jumlah_tiang, umur_inspeksi_bulan
--      FROM master_segmen ORDER BY penyulang, nama;
--
-- b. Berapa persen panjang tiap ULP yang masih berupa ketikan — ini yang perlu
--    dipantau: kalau tinggi bertahun-tahun, WO perabasan berjalan di atas kiraan:
--      SELECT ulp,
--             round(sum(panjang_pakai_km) FILTER (WHERE panjang_dari = 'ketikan')
--                   / NULLIF(sum(panjang_pakai_km), 0) * 100, 1) AS persen_ketikan,
--             round(sum(panjang_pakai_km), 2) AS total_km
--      FROM master_segmen WHERE status = 'aktif' GROUP BY ulp ORDER BY ulp;
--
-- c. Uji pembacaan label titik:
--      SELECT * FROM pisah_label_titik('REC. BRIMOB');   -- REC   | BRIMOB
--      SELECT * FROM pisah_label_titik('GI AMPENAN');    -- GI    | AMPENAN
--      SELECT * FROM pisah_label_titik('UJUNG');         -- UJUNG |
--      SELECT * FROM pisah_label_titik('OBEL-OBEL');     -- PENG  | OBEL-OBEL
--
-- d. Uji impor (pakai penyulang yang benar-benar ada di master):
--      SELECT jsonb_pretty(impor_segmen('GUNUNG SARI', '[
--        {"awal":"REC. BRIMOB","akhir":"LBS PASAR","km":3.4},
--        {"awal":"LBS PASAR","akhir":"UJUNG","km":7.0}
--      ]'::jsonb, 'uji'));
-- =============================================================================
