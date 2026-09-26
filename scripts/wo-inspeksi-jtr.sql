-- =============================================================================
-- J5a `rencana-mobile-jtm-jtr.md` (26 Sep 2026) — bagian JTR
-- Jalankan manual di Supabase SQL Editor, SESUDAH `jtr-tiang-bersama.sql`
-- (J5t). Idempoten. Memakai tabel WO yang sama dengan JTM (`wo_inspeksi*`).
--
--   0a. tiang.induk_jtr_id — induk JTR yang berupa batang pinjaman, supaya
--                           pohon JTM tidak ketambahan anak JTR
--   0. kabel PER GARDU   — satu batang bisa memikul kabel dua gardu; nomor
--                           kabel dihitung per gardu, KMS tidak dobel
--   1. master_gardu_jtr   — daftar acuan Susun WO: gardu + KMS + umur inspeksi
--   2. inspeksi_jtr.wo_item_id — tersambung ke WO; item ditutup saat disetujui
--   3. terbitkan_wo_inspeksi_jtr — WO bersatuan GARDU, diukur KMS penghantar
--   4. kirim_tiang_jtr(p_isi) — kiriman HP dalam SATU transaksi: tiang baru
--      (penjaga jarak = PERTANYAAN), MENUMPANG batang yang sudah ada, isian,
--      kabel, (+ tutup)
--   5. rekap: JTR punya WO terbit & KMS di luar WO
--
-- Beda JTR dari JTM, dan itu yang membentuk kiriman ini: isian tiang JTR
-- langsung mengubah MASTER tiang (tidak ada tabel jawaban), dan kepala
-- inspeksinya dulu baru lahir saat "Selesai". Sekarang kiriman SEMENTARA
-- pun membuat kepala berstatus Dalam Proses — supaya web dan tim lain
-- melihat gardu itu sedang dikerjakan (keputusan d: se-ULP).
-- =============================================================================


-- ── 0a. Induk JTR yang berupa batang pinjaman ───────────────────────────────
-- Tiang JTR baru yang disambung dari batang PINJAMAN (tiang JTM, atau tiang
-- gardu lain) tidak menulis `induk_id`: kolom itu pohon pemilik batang, dan
-- ±20 tampilan/fungsi JTM menghitung anak lewat sana — anak JTR di situ akan
-- membuat penamaan JTM mengira ada cabang. Induk JTR-nya di `induk_jtr_id`;
-- pohon JTR (`jtr_tiang`) membaca COALESCE(induk_jtr_id, induk_id).
ALTER TABLE public.tiang
  ADD COLUMN IF NOT EXISTS induk_jtr_id UUID REFERENCES public.tiang(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tiang_induk_jtr_idx ON public.tiang (induk_jtr_id) WHERE induk_jtr_id IS NOT NULL;
COMMENT ON COLUMN public.tiang.induk_jtr_id IS
  'Induk di pohon JTR bila induk itu batang PINJAMAN gardu ini (lihat tiang_jtr_tumpang). Terisi → induk_id kosong.';

CREATE OR REPLACE VIEW public.jtr_tiang AS
SELECT t.id,
    t.kode,
    t.gardu_kode,
    t.ulp,
    t.jurusan,
    COALESCE(t.induk_jtr_id, t.induk_id) AS induk_id,
    t.lat,
    t.lng,
    t.status_hidup,
    t.created_at,
    t.penyulang,
    t.penanda,
    t.percabangan,
    t.jenis,
    t.tinggi,
    t.kondisi,
    t.andongan,
    t.tarikan_sr,
    t.arde_kondisi,
    t.arde_nilai_ohm,
    t.stay_jenis,
    t.stay_kondisi,
    t.rawan_row,
    t.jamperan,
    t.underbuild_tm,
    t.catatan_perbaikan,
    t.foto_temuan,
    t.dikonfirmasi_at,
    false AS menumpang,
    NULL::uuid AS tumpang_id
   FROM tiang t
  WHERE t.gardu_kode IS NOT NULL
UNION ALL
 SELECT t.id,
    m.kode,
    upper(m.gardu_kode) AS gardu_kode,
    upper(m.ulp) AS ulp,
    m.jurusan,
    m.induk_id,
    t.lat,
    t.lng,
        CASE
            WHEN m.status = 'aktif'::text THEN t.status_hidup
            ELSE 'lepas'::text
        END AS status_hidup,
    m.created_at,
    t.penyulang,
    t.penanda,
    t.percabangan,
    t.jenis,
    t.tinggi,
    t.kondisi,
    t.andongan,
    t.tarikan_sr,
    t.arde_kondisi,
    t.arde_nilai_ohm,
    t.stay_jenis,
    t.stay_kondisi,
    t.rawan_row,
    t.jamperan,
    t.underbuild_tm,
    t.catatan_perbaikan,
    t.foto_temuan,
    t.dikonfirmasi_at,
    true AS menumpang,
    m.id AS tumpang_id
   FROM tiang_jtr_tumpang m
     JOIN tiang t ON t.id = m.tiang_id;

CREATE OR REPLACE VIEW public.peta_tiang AS
SELECT t.id,
    t.kode,
    t.ulp,
    t.lat,
    t.lng,
    t.penanda,
    t.percabangan,
        CASE
            WHEN t.gardu_kode IS NOT NULL THEN 'jtr'::text
            ELSE 'jtm'::text
        END AS jaringan,
    COALESCE(t.gardu_kode, t.penyulang) AS induk_kelompok,
    COALESCE(t.induk_jtr_id, t.induk_id) AS induk_id,
    p.lat AS induk_lat,
    p.lng AS induk_lng
   FROM tiang t
     LEFT JOIN tiang p ON p.id = COALESCE(t.induk_jtr_id, t.induk_id) AND p.status_hidup = 'aktif'::text
  WHERE t.status_hidup = 'aktif'::text AND t.lat IS NOT NULL AND t.lng IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tiang_buat_kode()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.kode IS NOT NULL AND btrim(NEW.kode) <> '' THEN RETURN NEW; END IF;
  IF NEW.gardu_kode IS NULL OR NEW.jurusan IS NULL THEN RETURN NEW; END IF;
  NEW.kode := public.jtr_kode_baru(NEW.gardu_kode, NEW.ulp, NEW.jurusan, COALESCE(NEW.induk_jtr_id, NEW.induk_id), NEW.lat, NEW.lng);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.batalkan_tiang(p_id uuid, p_nama text DEFAULT NULL::text, p_alasan text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t     RECORD;
  jml   INT;
  nama_dibuang TEXT[];
BEGIN
  SELECT * INTO t FROM public.tiang WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  IF t.status_hidup = 'batal' THEN
    RAISE EXCEPTION 'Tiang % sudah dibatalkan sebelumnya', t.kode;
  END IF;

  -- Alasan diwajibkan. Pembatalan tanpa alasan tidak memberi satu pun petunjuk
  -- kepada orang yang membacanya enam bulan lagi — dan yang tidak diterangkan
  -- akan dikira kesalahan sistem, bukan keputusan orang.
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
  END IF;

  -- Anak di pohon JTM/JTR milik sendiri DAN anak lewat keanggotaan JTR
  -- pinjaman (`tiang_jtr_tumpang`) — keduanya kehilangan induk kalau dibatalkan.
  SELECT (SELECT count(*) FROM public.tiang WHERE (induk_id = p_id OR induk_jtr_id = p_id) AND status_hidup = 'aktif')
       + (SELECT count(*) FROM public.tiang_jtr_tumpang WHERE induk_id = p_id AND status = 'aktif')
    INTO jml;

  IF jml > 0 THEN
    RAISE EXCEPTION
      'Tiang % masih menyuplai % tiang. Pindahkan dulu sambungannya ke tiang lain.',
      t.kode, jml;
  END IF;

  -- Dikumpulkan SEBELUM dibuang, supaya jejaknya menyebut nama apa saja yang
  -- hilang. Tanpa ini audit cuma bisa bilang "ada nama yang dibuang".
  SELECT array_agg(penyulang || '=' || kode ORDER BY penyulang)
    INTO nama_dibuang
  FROM public.tiang_kode_penyulang WHERE tiang_id = p_id;

  DELETE FROM public.tiang_kode_penyulang WHERE tiang_id = p_id;
  -- Batang yang dibatalkan lepas juga dari gardu-gardu yang meminjamnya.
  UPDATE public.tiang_jtr_tumpang SET status = 'lepas', catatan = 'tiangnya dibatalkan: ' || p_alasan, updated_at = now()
  WHERE tiang_id = p_id AND status = 'aktif';

  UPDATE public.tiang
  SET status_hidup = 'batal',
      aktif_sampai = CURRENT_DATE,
      catatan = p_alasan,
      updated_at = now()
  WHERE id = p_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t.kode, COALESCE(t.ulp, '-'), 'status_hidup',
          to_jsonb(t.status_hidup),
          jsonb_build_object('status', 'batal', 'alasan', p_alasan,
                             'nama_dibuang', COALESCE(nama_dibuang, '{}')),
          'batal_salah_input', auth.uid(), p_nama);
END $function$;


-- ── 0. Kabel per gardu ───────────────────────────────────────────────────────
-- `pemilik_gardu_kode` sejak awal dimaksudkan mencegah KMS dobel ("kabel
-- underbuild milik gardu lain"), tapi belum pernah dipakai tampilan, dan
-- nomor kabel unik per BATANG. Dengan batang pinjaman (J5t) keduanya harus
-- nyata: gardu Y yang meminjam tiang gardu X punya kabel 1-nya sendiri.
--
-- Aturannya satu: kabel milik COALESCE(pemilik_gardu_kode, gardu batang).
-- Pemilik yang sama dengan gardu batang disimpan kosong, supaya satu kabel
-- tidak punya dua cara ditulis.

CREATE OR REPLACE FUNCTION public.tiang_konduktor_pemilik()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.pemilik_gardu_kode := NULLIF(upper(btrim(COALESCE(NEW.pemilik_gardu_kode, ''))), '');
  IF NEW.pemilik_gardu_kode IS NOT NULL
     AND NEW.pemilik_gardu_kode = (SELECT upper(gardu_kode) FROM public.tiang WHERE id = NEW.tiang_id) THEN
    NEW.pemilik_gardu_kode := NULL;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_tiang_konduktor_pemilik ON public.tiang_konduktor;
CREATE TRIGGER trg_tiang_konduktor_pemilik BEFORE INSERT OR UPDATE OF pemilik_gardu_kode, tiang_id
  ON public.tiang_konduktor FOR EACH ROW EXECUTE FUNCTION public.tiang_konduktor_pemilik();

UPDATE public.tiang_konduktor SET pemilik_gardu_kode = pemilik_gardu_kode
WHERE pemilik_gardu_kode IS NOT NULL;   -- rapikan yang sudah ada (saat ini: tidak ada)

-- Nomor kabel unik per batang PER GARDU.
DROP INDEX IF EXISTS public.tiang_konduktor_unik;
CREATE UNIQUE INDEX tiang_konduktor_unik
  ON public.tiang_konduktor (tiang_id, (COALESCE(pemilik_gardu_kode, '')), nomor);

CREATE OR REPLACE VIEW public.jtr_kabel AS
SELECT k.*, upper(COALESCE(k.pemilik_gardu_kode, t.gardu_kode)) AS gardu
FROM public.tiang_konduktor k
JOIN public.tiang t ON t.id = k.tiang_id;
COMMENT ON VIEW public.jtr_kabel IS
  'Kabel tiang + gardu pemiliknya (pemilik_gardu_kode, atau gardu batang bila kosong). Semua hitungan JTR membaca kabel lewat sini.';
GRANT SELECT ON public.jtr_kabel TO authenticated;

CREATE OR REPLACE VIEW public.tiang_gawang_kabel AS
SELECT t.id AS tiang_id,
    t.kode,
    t.gardu_kode,
    t.ulp,
    t.jurusan,
    k.id AS konduktor_id,
    k.nomor AS nomor_kabel,
    k.jenis,
    k.ukuran,
    COALESCE(k.induk_tiang_id, t.induk_id) AS hulu_id,
    k.induk_tiang_id IS NOT NULL AS hulu_ditunjuk,
    jarak_meter(t.lat::double precision, t.lng::double precision, COALESCE(h.lat::double precision, g.lat), COALESCE(h.lng::double precision, g.lng)) AS panjang_m,
    COALESCE(k.induk_tiang_id, t.induk_id) IS NULL OR k.induk_tiang_id IS NOT NULL OR (EXISTS ( SELECT 1
           FROM jtr_kabel kp
          WHERE kp.tiang_id = t.induk_id AND kp.nomor = k.nomor AND kp.gardu = upper(t.gardu_kode))) AS tersambung
   FROM jtr_tiang t
     JOIN jtr_kabel k ON k.tiang_id = t.id AND k.gardu = upper(t.gardu_kode)
     LEFT JOIN tiang h ON h.id = COALESCE(k.induk_tiang_id, t.induk_id) AND h.status_hidup = 'aktif'::text
     LEFT JOIN gardu g ON upper(g.kode) = upper(t.gardu_kode) AND upper(g.ulp) = upper(t.ulp)
  WHERE t.status_hidup = 'aktif'::text AND t.gardu_kode IS NOT NULL;

CREATE OR REPLACE VIEW public.gardu_jtr_panjang AS
WITH rute AS (
         SELECT tiang_gawang.gardu_kode,
            tiang_gawang.ulp,
            tiang_gawang.jurusan,
            count(*) AS jumlah_tiang,
            sum(tiang_gawang.panjang_m) AS panjang_m,
            avg(tiang_gawang.panjang_m) AS rata_m,
            max(tiang_gawang.panjang_m) AS maks_m,
            count(*) FILTER (WHERE tiang_gawang.panjang_m IS NULL) AS gawang_tanpa_titik
           FROM tiang_gawang
          GROUP BY tiang_gawang.gardu_kode, tiang_gawang.ulp, tiang_gawang.jurusan
        ), tanpa_kabel AS (
         SELECT t.gardu_kode,
            t.ulp,
            t.jurusan,
            count(*) AS jml
           FROM jtr_tiang t
          WHERE t.status_hidup = 'aktif'::text AND t.gardu_kode IS NOT NULL AND NOT (EXISTS ( SELECT 1
                   FROM jtr_kabel k
                  WHERE k.tiang_id = t.id AND k.gardu = upper(t.gardu_kode)))
          GROUP BY t.gardu_kode, t.ulp, t.jurusan
        ), penghantar AS (
         SELECT tiang_gawang_kabel.gardu_kode,
            tiang_gawang_kabel.ulp,
            tiang_gawang_kabel.jurusan,
            max(tiang_gawang_kabel.nomor_kabel) AS jumlah_kabel,
            sum(tiang_gawang_kabel.panjang_m) FILTER (WHERE tiang_gawang_kabel.tersambung) AS panjang_m,
            count(*) FILTER (WHERE NOT tiang_gawang_kabel.tersambung) AS gawang_terputus
           FROM tiang_gawang_kabel
          GROUP BY tiang_gawang_kabel.gardu_kode, tiang_gawang_kabel.ulp, tiang_gawang_kabel.jurusan
        )
 SELECT r.gardu_kode,
    r.ulp,
    r.jurusan,
    j.arah AS arah_jurusan,
    r.jumlah_tiang,
    COALESCE(p.jumlah_kabel, 0) AS jumlah_kabel,
    round((r.panjang_m / 1000::double precision)::numeric, 3) AS panjang_rute_km,
    round((COALESCE(p.panjang_m, r.panjang_m) / 1000::double precision)::numeric, 3) AS panjang_penghantar_km,
    round(r.rata_m::numeric, 1) AS rata_gawang_m,
    round(r.maks_m::numeric, 1) AS gawang_terpanjang_m,
    r.gawang_tanpa_titik,
    COALESCE(tk.jml, 0::bigint) AS tiang_tanpa_kabel,
    COALESCE(p.gawang_terputus, 0::bigint) AS gawang_terputus
   FROM rute r
     LEFT JOIN penghantar p ON p.gardu_kode = r.gardu_kode AND p.ulp = r.ulp AND p.jurusan = r.jurusan
     LEFT JOIN tanpa_kabel tk ON tk.gardu_kode = r.gardu_kode AND tk.ulp = r.ulp AND tk.jurusan = r.jurusan
     LEFT JOIN jurusan_ref j ON j.kode = r.jurusan;

CREATE OR REPLACE VIEW public.inspeksi_jtr_temuan AS
WITH dasar AS (
         SELECT i.id AS inspeksi_id,
            i.gardu_kode,
            i.ulp,
            i.penyulang,
            i.tgl_mulai,
            t.id AS tiang_id,
            COALESCE(a.kode, t.kode) AS tiang_kode,
            COALESCE(a.jurusan, t.jurusan) AS jurusan,
            t.kondisi,
            t.arde_kondisi,
            t.andongan,
            t.rawan_row,
            t.stay_kondisi,
            t.jamperan,
            t.catatan_perbaikan,
            t.foto_temuan
           FROM inspeksi_jtr i
             JOIN inspeksi_jtr_titik x ON x.inspeksi_id = i.id
             JOIN tiang t ON t.id = x.tiang_id
             LEFT JOIN jtr_tiang a ON a.id = x.tiang_id AND upper(a.gardu_kode) = upper(i.gardu_kode) AND upper(a.ulp) = upper(i.ulp)
          WHERE i.status <> 'Dibatalkan'::text
        ), kabel AS (
         SELECT d.inspeksi_id,
            d.gardu_kode,
            d.ulp,
            d.penyulang,
            d.tgl_mulai,
            d.tiang_id,
            d.jurusan,
                CASE
                    WHEN k.nomor = 1 THEN d.tiang_kode
                    ELSE (d.tiang_kode || '.'::text) || k.nomor
                END AS tiang_kode,
            k.kondisi AS kabel_kondisi,
            k.aks_suspension,
            k.aks_large_angle,
            k.aks_dead_end,
            k.foto_temuan
           FROM dasar d
             JOIN jtr_kabel k ON k.tiang_id = d.tiang_id AND k.gardu = upper(d.gardu_kode)
        )
 SELECT inspeksi_id,
    tiang_id,
    tiang_kode,
    gardu_kode,
    ulp,
    penyulang,
    jurusan,
    tgl_mulai,
    temuan,
    urgensi,
    foto_url
   FROM ( SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Tiang '::text || lower(dasar.kondisi) AS temuan,
                CASE
                    WHEN dasar.kondisi = 'Miring'::text THEN 'Sedang'::text
                    ELSE 'Tinggi'::text
                END AS urgensi,
            dasar.foto_temuan ->> 'kondisi'::text AS foto_url
           FROM dasar
          WHERE dasar.kondisi IS NOT NULL AND NOT jtr_normal('kondisi_tiang'::text, dasar.kondisi)
        UNION ALL
         SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Arde '::text || lower(dasar.arde_kondisi),
            'Tinggi'::text AS text,
            dasar.foto_temuan ->> 'ardeKondisi'::text
           FROM dasar
          WHERE dasar.arde_kondisi IS NOT NULL AND NOT jtr_normal('kondisi_arde'::text, dasar.arde_kondisi)
        UNION ALL
         SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Andongan '::text || lower(dasar.andongan),
            'Sedang'::text AS text,
            dasar.foto_temuan ->> 'andongan'::text
           FROM dasar
          WHERE dasar.andongan IS NOT NULL AND NOT jtr_normal('kondisi_andongan'::text, dasar.andongan)
        UNION ALL
         SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Stay '::text || lower(dasar.stay_kondisi),
            'Sedang'::text AS text,
            dasar.foto_temuan ->> 'stayKondisi'::text
           FROM dasar
          WHERE dasar.stay_kondisi IS NOT NULL AND NOT jtr_normal('kondisi_stay'::text, dasar.stay_kondisi)
        UNION ALL
         SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Rawan ROW: '::text || lower(r.r),
            'Sedang'::text AS text,
            dasar.foto_temuan ->> 'rawanRow'::text
           FROM dasar,
            LATERAL unnest(dasar.rawan_row) r(r)
          WHERE r.r IS NOT NULL AND r.r <> ''::text AND NOT jtr_normal('rawan_row'::text, r.r)
        UNION ALL
         SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Jamperan '::text || lower(j.value ->> 'kondisi'::text),
            'Sedang'::text AS text,
            dasar.foto_temuan ->> 'jamperanKondisi'::text
           FROM dasar,
            LATERAL jsonb_array_elements(dasar.jamperan) j(value)
          WHERE (j.value ->> 'kondisi'::text) IS NOT NULL AND NOT jtr_normal('kondisi_jamperan'::text, j.value ->> 'kondisi'::text)
        UNION ALL
         SELECT dasar.inspeksi_id,
            dasar.tiang_id,
            dasar.tiang_kode,
            dasar.gardu_kode,
            dasar.ulp,
            dasar.penyulang,
            dasar.jurusan,
            dasar.tgl_mulai,
            'Ada catatan perbaikan'::text AS text,
            'Sedang'::text AS text,
            NULL::text AS text
           FROM dasar
          WHERE btrim(COALESCE(dasar.catatan_perbaikan, ''::text)) <> ''::text
        UNION ALL
         SELECT kabel.inspeksi_id,
            kabel.tiang_id,
            kabel.tiang_kode,
            kabel.gardu_kode,
            kabel.ulp,
            kabel.penyulang,
            kabel.jurusan,
            kabel.tgl_mulai,
            'Konduktor '::text || lower(kabel.kabel_kondisi),
                CASE
                    WHEN kabel.kabel_kondisi = 'Putus'::text THEN 'Tinggi'::text
                    ELSE 'Sedang'::text
                END AS "case",
            kabel.foto_temuan ->> 'konduktorKondisi'::text
           FROM kabel
          WHERE kabel.kabel_kondisi IS NOT NULL AND NOT jtr_normal('kondisi_kabel'::text, kabel.kabel_kondisi)
        UNION ALL
         SELECT kabel.inspeksi_id,
            kabel.tiang_id,
            kabel.tiang_kode,
            kabel.gardu_kode,
            kabel.ulp,
            kabel.penyulang,
            kabel.jurusan,
            kabel.tgl_mulai,
            'Suspension '::text || lower(kabel.aks_suspension),
            'Sedang'::text AS text,
            kabel.foto_temuan ->> 'aksSuspension'::text
           FROM kabel
          WHERE kabel.aks_suspension IS NOT NULL AND NOT jtr_normal('kondisi_aksesoris'::text, kabel.aks_suspension)
        UNION ALL
         SELECT kabel.inspeksi_id,
            kabel.tiang_id,
            kabel.tiang_kode,
            kabel.gardu_kode,
            kabel.ulp,
            kabel.penyulang,
            kabel.jurusan,
            kabel.tgl_mulai,
            'Large angle '::text || lower(kabel.aks_large_angle),
            'Sedang'::text AS text,
            kabel.foto_temuan ->> 'aksLargeAngle'::text
           FROM kabel
          WHERE kabel.aks_large_angle IS NOT NULL AND NOT jtr_normal('kondisi_aksesoris'::text, kabel.aks_large_angle)
        UNION ALL
         SELECT kabel.inspeksi_id,
            kabel.tiang_id,
            kabel.tiang_kode,
            kabel.gardu_kode,
            kabel.ulp,
            kabel.penyulang,
            kabel.jurusan,
            kabel.tgl_mulai,
            'Dead end '::text || lower(kabel.aks_dead_end),
            'Sedang'::text AS text,
            kabel.foto_temuan ->> 'aksDeadEnd'::text
           FROM kabel
          WHERE kabel.aks_dead_end IS NOT NULL AND NOT jtr_normal('kondisi_aksesoris'::text, kabel.aks_dead_end)) s;

GRANT SELECT ON public.tiang_gawang_kabel, public.gardu_jtr_panjang, public.inspeksi_jtr_temuan TO authenticated;

-- Parameter bertambah (p_gardu) → DROP dulu. Aplikasi HP lama memanggil
-- dengan tiga nama argumen — tetap cocok, perilakunya tetap.
DROP FUNCTION IF EXISTS public.simpan_konduktor_tiang(uuid, jsonb, text);
CREATE OR REPLACE FUNCTION public.simpan_konduktor_tiang(p_tiang_id uuid, p_daftar jsonb, p_nama text DEFAULT NULL::text, p_gardu text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t       RECORD;
  h       RECORD;
  k       JSONB;
  lama    RECORD;
  hulu    UUID;
  no_kabel INT;
  dipakai INT[] := '{}';
  diff    JSONB := '{}'::jsonb;
  v_gardu TEXT;
  pemilik TEXT;   -- NULL = gardu pemilik batang; terisi = gardu yang meminjam
BEGIN
  SELECT kode, ulp, gardu_kode INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  -- Kabel dicatat PER GARDU. Tanpa p_gardu (aplikasi lama): gardu pemilik
  -- batang, perilaku lama utuh. Dengan p_gardu: batang harus anggota
  -- jaringan gardu itu (milik atau pinjaman), dan hanya kabel gardu itu
  -- yang disentuh — kabel gardu lain di batang yang sama tidak terhapus.
  v_gardu := upper(COALESCE(NULLIF(btrim(p_gardu), ''), t.gardu_kode));
  IF v_gardu IS NULL THEN RAISE EXCEPTION 'Tiang % belum menjadi bagian JTR gardu mana pun', t.kode; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jtr_tiang j
                 WHERE j.id = p_tiang_id AND upper(j.gardu_kode) = v_gardu AND j.status_hidup = 'aktif') THEN
    RAISE EXCEPTION 'Tiang % bukan bagian jaringan gardu %', t.kode, v_gardu;
  END IF;
  pemilik := CASE WHEN v_gardu = upper(t.gardu_kode) THEN NULL ELSE v_gardu END;
  SELECT kode INTO t.kode FROM public.jtr_tiang j
  WHERE j.id = p_tiang_id AND upper(j.gardu_kode) = v_gardu ORDER BY j.menumpang LIMIT 1;

  FOR k IN SELECT * FROM jsonb_array_elements(COALESCE(p_daftar, '[]'::jsonb)) LOOP
    no_kabel := (k->>'nomor')::int;
    hulu  := NULLIF(k->>'hulu_id', '')::uuid;
    dipakai := dipakai || no_kabel;

    IF hulu IS NOT NULL THEN
      IF hulu = p_tiang_id THEN
        RAISE EXCEPTION 'Tiang % tidak bisa jadi asal kabel bagi dirinya sendiri', t.kode;
      END IF;
      SELECT kode, ulp, gardu_kode INTO h FROM public.tiang
      WHERE id = hulu AND status_hidup = 'aktif';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Tiang asal kabel ke-% tidak ditemukan atau sudah tidak aktif', no_kabel;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.jtr_tiang j
                     WHERE j.id = hulu AND upper(j.gardu_kode) = v_gardu
                       AND upper(j.ulp) = upper(t.ulp) AND j.status_hidup = 'aktif') THEN
        RAISE EXCEPTION 'Tiang asal % bukan bagian jaringan gardu yang sama', h.kode;
      END IF;
      -- Cegah dua tiang saling menunjuk: bentangnya akan terhitung dua kali.
      IF EXISTS (
        SELECT 1 FROM public.jtr_kabel x
        WHERE x.tiang_id = hulu AND x.induk_tiang_id = p_tiang_id AND x.gardu = v_gardu
      ) THEN
        RAISE EXCEPTION 'Tiang % sudah menunjuk % sebagai asal kabelnya', h.kode, t.kode;
      END IF;
    END IF;

    SELECT * INTO lama FROM public.tiang_konduktor
    WHERE tiang_id = p_tiang_id AND nomor = no_kabel
      AND COALESCE(pemilik_gardu_kode, '') = COALESCE(pemilik, '');

    IF FOUND THEN
      IF lama.jenis IS DISTINCT FROM (k->>'jenis')
         OR lama.ukuran IS DISTINCT FROM (k->>'ukuran') THEN
        diff := diff || jsonb_build_object(
          'kabel_' || no_kabel,
          jsonb_build_array(
            concat_ws(' ', lama.jenis, lama.ukuran),
            concat_ws(' ', k->>'jenis', k->>'ukuran')));
      END IF;
      IF lama.induk_tiang_id IS DISTINCT FROM hulu THEN
        diff := diff || jsonb_build_object(
          'asal_kabel_' || no_kabel,
          jsonb_build_array(
            (SELECT kode FROM public.tiang WHERE id = lama.induk_tiang_id),
            (SELECT kode FROM public.tiang WHERE id = hulu)));
      END IF;
    END IF;

    INSERT INTO public.tiang_konduktor
      (tiang_id, nomor, jenis, ukuran, kondisi, induk_tiang_id,
       aks_suspension, aks_large_angle, aks_dead_end, foto_temuan, pemilik_gardu_kode)
    VALUES (p_tiang_id, no_kabel, k->>'jenis', k->>'ukuran', k->>'kondisi', hulu,
            k->>'aks_suspension', k->>'aks_large_angle', k->>'aks_dead_end',
            COALESCE(k->'foto_temuan', '{}'::jsonb), pemilik)
    ON CONFLICT (tiang_id, (COALESCE(pemilik_gardu_kode, '')), nomor) DO UPDATE
      SET jenis           = EXCLUDED.jenis,
          ukuran          = EXCLUDED.ukuran,
          kondisi         = EXCLUDED.kondisi,
          induk_tiang_id  = EXCLUDED.induk_tiang_id,
          aks_suspension  = EXCLUDED.aks_suspension,
          aks_large_angle = EXCLUDED.aks_large_angle,
          aks_dead_end    = EXCLUDED.aks_dead_end,
          -- Digabung, bukan ditimpa — alasan yang sama dengan `koreksi_tiang`.
          foto_temuan     = public.tiang_konduktor.foto_temuan || EXCLUDED.foto_temuan,
          updated_at      = now();
  END LOOP;

  DELETE FROM public.tiang_konduktor
  WHERE tiang_id = p_tiang_id AND NOT (nomor = ANY (dipakai))
    AND COALESCE(pemilik_gardu_kode, '') = COALESCE(pemilik, '');

  IF diff <> '{}'::jsonb THEN
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'konduktor', NULL, diff,
            'koreksi_lapangan', auth.uid(), p_nama);
  END IF;
END $function$;
GRANT EXECUTE ON FUNCTION public.simpan_konduktor_tiang(uuid, jsonb, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_konduktor_tiang(p_tiang_id uuid, p_nomor integer, p_jenis text, p_ukuran text, p_kondisi text DEFAULT NULL::text, p_pemilik text DEFAULT NULL::text, p_nama text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t    RECORD;
  lama RECORD;
  id_k UUID;
BEGIN
  SELECT kode, ulp INTO t FROM public.tiang WHERE id = p_tiang_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tiang tidak ditemukan'; END IF;

  SELECT * INTO lama FROM public.tiang_konduktor
  WHERE tiang_id = p_tiang_id AND nomor = p_nomor
    AND COALESCE(pemilik_gardu_kode, '') = COALESCE(upper(NULLIF(btrim(p_pemilik), '')), '');

  INSERT INTO public.tiang_konduktor (tiang_id, nomor, jenis, ukuran, kondisi, pemilik_gardu_kode)
  VALUES (p_tiang_id, p_nomor, p_jenis, p_ukuran, p_kondisi, p_pemilik)
  ON CONFLICT (tiang_id, (COALESCE(pemilik_gardu_kode, '')), nomor) DO UPDATE
    SET jenis = EXCLUDED.jenis,
        ukuran = EXCLUDED.ukuran,
        kondisi = COALESCE(EXCLUDED.kondisi, public.tiang_konduktor.kondisi),
        pemilik_gardu_kode = COALESCE(EXCLUDED.pemilik_gardu_kode, public.tiang_konduktor.pemilik_gardu_kode),
        updated_at = now()
  RETURNING id INTO id_k;

  IF FOUND AND lama.id IS NOT NULL
     AND (lama.ukuran IS DISTINCT FROM p_ukuran OR lama.jenis IS DISTINCT FROM p_jenis) THEN
    INSERT INTO public.master_audit (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('tiang', t.kode, t.ulp, 'konduktor_' || p_nomor,
            jsonb_build_object('jenis', lama.jenis, 'ukuran', lama.ukuran),
            jsonb_build_object('jenis', p_jenis, 'ukuran', p_ukuran),
            'koreksi_lapangan', auth.uid(), p_nama);
  END IF;

  RETURN id_k;
END $function$;


-- ── 1. Acuan gardu untuk Susun WO ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.master_gardu_jtr AS
SELECT
  upper(g.kode) AS gardu_kode,
  upper(g.ulp)  AS ulp,
  g.nama,
  g.feeder      AS penyulang,
  COALESCE(pj.km, 0)::numeric(10,3) AS panjang_km,
  COALESCE(tg.jumlah, 0)            AS jumlah_tiang,
  ins.terakhir                      AS terakhir_inspeksi,
  CASE WHEN ins.terakhir IS NULL THEN NULL
       ELSE floor((CURRENT_DATE - ins.terakhir) / 30.0)::int END AS umur_inspeksi_bulan
FROM public.gardu g
LEFT JOIN LATERAL (
  SELECT sum(p.panjang_km) AS km FROM public.gardu_jtr_penghantar p
  WHERE p.gardu_kode = g.kode AND p.ulp = g.ulp
) pj ON true
LEFT JOIN LATERAL (
  -- Termasuk batang pinjaman (`jtr_tiang`) — jumlah tiang jaringan gardu ini.
  SELECT count(*) AS jumlah FROM public.jtr_tiang t
  WHERE upper(t.gardu_kode) = upper(g.kode) AND upper(t.ulp) = upper(g.ulp) AND t.status_hidup = 'aktif'
) tg ON true
LEFT JOIN LATERAL (
  -- Umur dihitung dari yang DISETUJUI saja — pola master_segmen.
  SELECT max(i.tgl_selesai) AS terakhir FROM public.inspeksi_jtr i
  WHERE upper(i.gardu_kode) = upper(g.kode) AND upper(i.ulp) = upper(g.ulp) AND i.status = 'Diverifikasi'
) ins ON true;
GRANT SELECT ON public.master_gardu_jtr TO authenticated;


-- ── 2. Inspeksi JTR tersambung ke WO ─────────────────────────────────────────
ALTER TABLE public.inspeksi_jtr
  ADD COLUMN IF NOT EXISTS wo_item_id UUID REFERENCES public.wo_inspeksi_item(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS inspeksi_jtr_wo_item_idx ON public.inspeksi_jtr (wo_item_id);

CREATE OR REPLACE FUNCTION public.jtr_sambung_wo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.wo_item_id IS NULL THEN
    SELECT i.id INTO NEW.wo_item_id FROM public.wo_inspeksi_item i
    WHERE i.jenis = 'JTR' AND upper(i.gardu_kode) = upper(NEW.gardu_kode)
      AND upper(i.ulp) = upper(NEW.ulp) AND i.status = 'Terbuka'
    LIMIT 1;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_jtr_sambung_wo ON public.inspeksi_jtr;
CREATE TRIGGER trg_jtr_sambung_wo BEFORE INSERT ON public.inspeksi_jtr
  FOR EACH ROW EXECUTE FUNCTION public.jtr_sambung_wo();

CREATE OR REPLACE FUNCTION public.jtr_tutup_item_wo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.wo_item_id IS NOT NULL AND NEW.status = 'Diverifikasi'
     AND OLD.status IS DISTINCT FROM 'Diverifikasi' THEN
    UPDATE public.wo_inspeksi_item SET status = 'Selesai', updated_at = now()
    WHERE id = NEW.wo_item_id AND status = 'Terbuka';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_jtr_tutup_item_wo ON public.inspeksi_jtr;
CREATE TRIGGER trg_jtr_tutup_item_wo AFTER UPDATE OF status ON public.inspeksi_jtr
  FOR EACH ROW EXECUTE FUNCTION public.jtr_tutup_item_wo();

-- Keluarkan dari WO: sambungan inspeksi JTR ikut dilepas (JTM sudah).
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
  UPDATE public.inspeksi_jtm SET wo_item_id = NULL, updated_at = now() WHERE wo_item_id = p_item_id;
  UPDATE public.inspeksi_jtr SET wo_item_id = NULL, updated_at = now() WHERE wo_item_id = p_item_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_inspeksi_item', it.objek_nama, it.ulp, 'dibatalkan', to_jsonb(it.status),
          to_jsonb(p_alasan), 'sunting_admin', auth.uid(), p_oleh);
END $fn$;

-- Item WO JTR + tahap yang DITURUNKAN dari inspeksi terakhirnya.
CREATE OR REPLACE VIEW public.wo_inspeksi_item_status_jtr AS
SELECT
  i.*,
  w.nama   AS wo_nama,
  w.tgl_wo,
  m.id     AS inspeksi_id,
  m.status AS inspeksi_status,
  m.inspektor_nama AS inspeksi_petugas,
  m.tgl_mulai      AS inspeksi_mulai,
  m.tgl_selesai    AS inspeksi_selesai,
  m.verified_note  AS inspeksi_catatan_admin
FROM public.wo_inspeksi_item i
JOIN public.wo_inspeksi w ON w.id = i.wo_id
LEFT JOIN LATERAL (
  SELECT x.* FROM public.inspeksi_jtr x
  WHERE x.wo_item_id = i.id AND x.status <> 'Dibatalkan'
  ORDER BY x.created_at DESC LIMIT 1
) m ON true
WHERE i.jenis = 'JTR';
GRANT SELECT ON public.wo_inspeksi_item_status_jtr TO authenticated;


-- ── 3. Terbitkan WO inspeksi JTR ─────────────────────────────────────────────
-- p_gardu: kode gardu; p_regu: {"<kode gardu>": "<tim>"} — opsional.
CREATE OR REPLACE FUNCTION public.terbitkan_wo_inspeksi_jtr(
  p_ulp       TEXT,
  p_nama      TEXT,
  p_target_km NUMERIC,
  p_gardu     TEXT[],
  p_tgl_wo    DATE  DEFAULT CURRENT_DATE,
  p_regu      JSONB DEFAULT '{}'::jsonb,
  p_oleh      TEXT  DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  unit     TEXT := upper(btrim(COALESCE(p_ulp, '')));
  judul    TEXT := btrim(COALESCE(p_nama, ''));
  wo       UUID;
  g        RECORD;
  item     UUID;
  n        INT := 0;
  dilewati JSONB := '[]'::jsonb;
BEGIN
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih'; END IF;
  IF judul = '' THEN RAISE EXCEPTION 'Nama WO belum diisi'; END IF;
  IF COALESCE(array_length(p_gardu, 1), 0) = 0 THEN RAISE EXCEPTION 'Belum ada gardu yang dipilih'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);

  INSERT INTO public.wo_inspeksi (jenis, ulp, nama, tgl_wo, target_km, created_by)
  VALUES ('JTR', unit, judul, COALESCE(p_tgl_wo, CURRENT_DATE), p_target_km, auth.uid())
  RETURNING id INTO wo;

  FOR g IN
    SELECT * FROM public.master_gardu_jtr
    WHERE ulp = unit AND gardu_kode = ANY (SELECT upper(x) FROM unnest(p_gardu) x)
    ORDER BY penyulang NULLS LAST, gardu_kode
  LOOP
    IF EXISTS (SELECT 1 FROM public.wo_inspeksi_item x
               WHERE x.jenis = 'JTR' AND upper(x.gardu_kode) = g.gardu_kode AND upper(x.ulp) = g.ulp
                 AND x.status = 'Terbuka') THEN
      dilewati := dilewati || jsonb_build_object('gardu', g.gardu_kode, 'sebab', 'Masih terbuka di WO inspeksi lain.');
      CONTINUE;
    END IF;

    n := n + 1;
    INSERT INTO public.wo_inspeksi_item
      (wo_id, jenis, urutan, ulp, penyulang, gardu_kode, objek_nama, panjang_km, panjang_dari, regu)
    VALUES
      (wo, 'JTR', n, g.ulp, g.penyulang, g.gardu_kode,
       concat_ws(' · ', g.gardu_kode, NULLIF(btrim(g.nama), '')),
       g.panjang_km, CASE WHEN g.panjang_km > 0 THEN 'hitungan' ELSE 'kosong' END,
       NULLIF(btrim(COALESCE(p_regu ->> g.gardu_kode, '')), ''))
    RETURNING id INTO item;

    -- Inspeksi yang sedang berjalan di gardu ini ikut tersambung.
    UPDATE public.inspeksi_jtr SET wo_item_id = item, updated_at = now()
    WHERE upper(gardu_kode) = g.gardu_kode AND upper(ulp) = g.ulp AND wo_item_id IS NULL
      AND status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak');
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'Tidak ada satu pun gardu yang bisa dimasukkan. %',
      COALESCE((SELECT string_agg(d ->> 'gardu' || ': ' || (d ->> 'sebab'), ' | ') FROM jsonb_array_elements(dilewati) d), '');
  END IF;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_inspeksi', judul, unit, 'terbit', NULL,
          jsonb_build_object('wo_id', wo, 'jenis', 'JTR', 'item', n, 'target_km', p_target_km),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('wo_id', wo, 'nama', judul, 'ulp', unit, 'item', n, 'dilewati', dilewati,
    'rencana_km', (SELECT round(COALESCE(sum(panjang_km), 0), 2) FROM public.wo_inspeksi_item WHERE wo_id = wo));
END $fn$;

GRANT EXECUTE ON FUNCTION public.terbitkan_wo_inspeksi_jtr(TEXT, TEXT, NUMERIC, TEXT[], DATE, JSONB, TEXT) TO authenticated;


-- id_lokal (uuid dari HP) → tiang: lahir di kiriman ini (peta), atau di
-- kiriman SEBELUMNYA — tiang baru (tiang.id_hp) maupun pinjaman
-- (tiang_jtr_tumpang.id_hp). "Kirim tiang" boleh dicicil.
CREATE OR REPLACE FUNCTION public.jtr_id_lokal(p_peta JSONB, p_lokal TEXT)
RETURNS UUID LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT COALESCE(
    NULLIF(p_peta->>p_lokal, '')::uuid,
    (SELECT id FROM public.tiang WHERE id_hp = NULLIF(p_lokal, '')::uuid),
    (SELECT tiang_id FROM public.tiang_jtr_tumpang WHERE id_hp = NULLIF(p_lokal, '')::uuid))
$fn$;

-- ── 4. Kiriman HP ────────────────────────────────────────────────────────────
-- p_isi:
-- { "gardu_kode", "ulp", "penyulang", "nama", "petugas_2",
--   "tiang": [ { "id_lokal": uuid,
--                "tiang_id": uuid|null,          -- anggota lama gardu ini
--                "baru":    {jurusan, induk_id?, induk_lokal?, lat, lng, batang_beda?}|null,
--                "tumpang": {tiang_id, jurusan, induk_id?, induk_lokal?}|null,
--                "titik": {lat,lng}|null,          -- koreksi titik batang
--                "kolom": {jenis,tinggi,kondisi,andongan,tarikan_sr,arde_kondisi,
--                          arde_nilai_ohm,stay_jenis,stay_kondisi,rawan_row,
--                          jamperan,underbuild_tm,catatan_perbaikan,foto_temuan},
--                "konduktor": [ {nomor,jenis,ukuran,kondisi,hulu_id?,hulu_lokal?,
--                                aks_suspension,aks_large_angle,aks_dead_end,foto_temuan} ] } ],
--   "selesai": bool, "catatan_selesai": "..." }
--
-- Dua putaran, URUTAN KIRIMAN = urutan di lapangan: putaran 1 melahirkan
-- tiang baru & keanggotaan pinjaman (nama JTR dari `jtr_kode_baru`; induk
-- boleh lahir di kiriman yang sama), putaran 2 menulis isian & kabel.
--
-- Tiang baru di dekat batang yang sudah ada (JTM maupun JTR, radius tumpang
-- JTM ULP itu) DITANYAKAN, bukan dilarang: HP menawarkan "menumpang tiang X"
-- atau "dua batang berbeda" (`batang_beda`) — jawaban kedua dicatat untuk
-- admin (`beda_dari_tiang_id`), sama dengan JTM.
CREATE OR REPLACE FUNCTION public.kirim_tiang_jtr(p_isi JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role  TEXT;
  v_unit  TEXT;
  v_gardu TEXT := upper(btrim(COALESCE(p_isi->>'gardu_kode', '')));
  v_ulp   TEXT := upper(btrim(COALESCE(p_isi->>'ulp', '')));
  v_nama  TEXT := NULLIF(btrim(COALESCE(p_isi->>'nama', '')), '');
  v_insp  UUID;
  v_stat  TEXT;
  peta    JSONB := '{}'::jsonb;   -- id_lokal → tiang_id
  hasil   JSONB := '[]'::jsonb;
  r       JSONB;
  b       JSONB;
  k       JSONB;
  kol     JSONB;
  kabel   JSONB;
  v_lokal UUID;
  v_tiang UUID;
  v_induk UUID;
  v_pinjam BOOLEAN;
  v_kode  TEXT;
  v_lat  DOUBLE PRECISION;
  v_lng   DOUBLE PRECISION;
  radius  NUMERIC;
  d_id    UUID;
  d_kode  TEXT;
  d_m     DOUBLE PRECISION;
  sisa    INT := 0;
BEGIN
  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF v_gardu = '' OR v_ulp = '' THEN RAISE EXCEPTION 'Gardu tidak disebut — perbarui aplikasi lalu kirim ulang.'; END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> v_ulp THEN
    RAISE EXCEPTION 'Gardu ini milik ULP %, akun ini ULP %.', v_ulp, COALESCE(v_unit, '-');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('inspeksi-jtr|' || v_gardu || '|' || v_ulp));
  radius := (public.jtm_ambang(v_ulp)).radius_tumpang_m;

  -- Foto temuan harus sudah terunggah.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) t,
         LATERAL (
           SELECT value FROM jsonb_each_text(COALESCE(t->'kolom'->'foto_temuan', '{}'::jsonb))
           UNION ALL
           SELECT f.value FROM jsonb_array_elements(COALESCE(t->'konduktor', '[]'::jsonb)) c,
                  jsonb_each_text(COALESCE(c->'foto_temuan', '{}'::jsonb)) f
         ) foto
    WHERE foto.value NOT LIKE 'http%'
  ) THEN
    RAISE EXCEPTION 'Foto temuan belum terunggah. Kirim ulang saat sinyal lebih baik.';
  END IF;

  -- Inspeksi terakhir gardu ini.
  SELECT id, status INTO v_insp, v_stat FROM public.inspeksi_jtr
  WHERE upper(gardu_kode) = v_gardu AND upper(ulp) = v_ulp AND status <> 'Dibatalkan'
  ORDER BY created_at DESC LIMIT 1;

  IF v_stat = 'Selesai' THEN
    -- Kiriman "selesai" yang jawabannya hilang di jalan: semua tiang baru &
    -- pinjaman sudah tercatat → anggap berhasil. Selain itu: sudah dikirim.
    FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
      v_lokal := NULLIF(r->>'id_lokal', '')::uuid;
      IF (jsonb_typeof(r->'baru') = 'object' AND NOT EXISTS (SELECT 1 FROM public.tiang WHERE id_hp = v_lokal))
         OR (jsonb_typeof(r->'tumpang') = 'object' AND NOT EXISTS (SELECT 1 FROM public.tiang_jtr_tumpang WHERE id_hp = v_lokal)) THEN
        sisa := sisa + 1;
      END IF;
    END LOOP;
    IF sisa = 0 AND COALESCE((p_isi->>'selesai')::boolean, false) THEN
      RETURN jsonb_build_object('inspeksi_id', v_insp, 'sudah_ada', true, 'tiang', '[]'::jsonb);
    END IF;
    RAISE EXCEPTION 'Inspeksi gardu % sudah dikirim dan menunggu persetujuan — tidak bisa ditambah. Minta admin mengembalikannya bila perlu.', v_gardu;
  END IF;

  IF v_stat = 'Ditolak' THEN
    -- Dikembalikan admin: inspeksi yang SAMA dibuka lagi, bukan lahir baru.
    UPDATE public.inspeksi_jtr SET status = 'Dalam Proses', tgl_selesai = NULL, updated_at = now()
    WHERE id = v_insp;
  ELSIF v_stat IS NULL OR v_stat = 'Diverifikasi' THEN
    -- Belum ada yang berjalan: kepala Dalam Proses — kiriman sementara pun
    -- terlihat di web dan di HP tim lain.
    INSERT INTO public.inspeksi_jtr (gardu_kode, ulp, penyulang, tgl_mulai, status, inspektor_uid, inspektor_nama, petugas_2)
    VALUES (v_gardu, v_ulp, NULLIF(p_isi->>'penyulang', ''), (now() AT TIME ZONE 'Asia/Makassar')::date,
            'Dalam Proses', auth.uid(), v_nama, NULLIF(p_isi->>'petugas_2', ''))
    RETURNING id INTO v_insp;
  END IF;

  -- Putaran 1: tiang baru & pinjaman (idempoten lewat id_hp).
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
    v_lokal := NULLIF(r->>'id_lokal', '')::uuid;

    IF jsonb_typeof(r->'baru') = 'object' THEN
      b := r->'baru';
      SELECT id INTO v_tiang FROM public.tiang WHERE id_hp = v_lokal;
      IF v_tiang IS NULL THEN
        v_induk := COALESCE(NULLIF(b->>'induk_id', '')::uuid, public.jtr_id_lokal(peta, b->>'induk_lokal'));
        v_lat := NULLIF(b->>'lat', '')::double precision;
        v_lng := NULLIF(b->>'lng', '')::double precision;

        -- Satu batang tidak boleh lahir dua kali — kecuali regu menyatakan
        -- memang batang lain (JTR di sebelah JTM bisa berjarak 0,2 m).
        d_id := NULL;
        SELECT t.id, t.kode, public.jarak_meter(v_lat, v_lng, t.lat, t.lng)
          INTO d_id, d_kode, d_m
        FROM public.tiang t
        WHERE t.status_hidup = 'aktif' AND t.lat IS NOT NULL AND t.lng IS NOT NULL
          AND upper(COALESCE(t.ulp, '')) = v_ulp
        ORDER BY public.jarak_meter(v_lat, v_lng, t.lat, t.lng)
        LIMIT 1;
        IF d_id IS NOT NULL AND d_m <= radius AND NOT COALESCE((b->>'batang_beda')::boolean, false) THEN
          RAISE EXCEPTION 'Tiang % sudah berdiri % m dari titik tiang baru. Pilih "menumpang tiang itu", atau nyatakan dua batang berbeda.',
            d_kode, round(d_m::numeric, 1);
        END IF;

        IF v_induk IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.jtr_tiang
          WHERE id = v_induk AND upper(gardu_kode) = v_gardu AND upper(ulp) = v_ulp AND status_hidup = 'aktif') THEN
          RAISE EXCEPTION 'Tiang induk bukan bagian jaringan gardu % — tumpangi dulu tiang itu.', v_gardu;
        END IF;

        -- Induk tiang JTR gardu ini sendiri → induk_id; induk batang pinjaman
        -- → induk_jtr_id (pohon pemilik batang tidak ketambahan anak).
        v_pinjam := v_induk IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.tiang WHERE id = v_induk AND upper(gardu_kode) = v_gardu AND upper(ulp) = v_ulp);

        INSERT INTO public.tiang
          (gardu_kode, ulp, jurusan, induk_id, induk_jtr_id, lat, lng, status_hidup, sumber, dikonfirmasi_at, dikonfirmasi_oleh, id_hp,
           beda_dari_tiang_id, beda_dari_jarak_m)
        VALUES (v_gardu, v_ulp, NULLIF(b->>'jurusan', ''),
                CASE WHEN v_pinjam THEN NULL ELSE v_induk END,
                CASE WHEN v_pinjam THEN v_induk END,
                v_lat, v_lng,
                'aktif', 'lapangan', now(), v_nama, v_lokal,
                CASE WHEN d_m <= radius THEN d_id END,
                CASE WHEN d_m <= radius THEN round(d_m::numeric, 1) END)
        RETURNING id INTO v_tiang;
      END IF;
      peta := peta || jsonb_build_object(r->>'id_lokal', v_tiang);

    ELSIF jsonb_typeof(r->'tumpang') = 'object' THEN
      b := r->'tumpang';
      v_tiang := NULLIF(b->>'tiang_id', '')::uuid;
      PERFORM public.tumpangi_tiang_jtr(
        v_gardu, v_ulp, NULLIF(b->>'jurusan', ''), v_tiang,
        COALESCE(NULLIF(b->>'induk_id', '')::uuid, public.jtr_id_lokal(peta, b->>'induk_lokal')),
        v_nama, v_lokal);
      peta := peta || jsonb_build_object(r->>'id_lokal', v_tiang);
    END IF;
  END LOOP;

  -- Putaran 2: isian & kabel (tiang baru, pinjaman, maupun lama).
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_isi->'tiang', '[]'::jsonb)) LOOP
    v_tiang := COALESCE(NULLIF(r->>'tiang_id', '')::uuid, NULLIF(peta->>(r->>'id_lokal'), '')::uuid);
    IF v_tiang IS NULL THEN
      RAISE EXCEPTION 'Satu tiang di kiriman ini tidak punya id — perbarui aplikasi lalu kirim ulang.';
    END IF;
    kol := COALESCE(r->'kolom', '{}'::jsonb);

    -- Isian fisik menulis MASTER — satu batang, satu data, dari JTR maupun JTM.
    PERFORM public.koreksi_tiang(
      v_tiang,
      NULLIF(kol->>'jenis', ''),
      NULLIF(kol->>'tinggi', '')::numeric,
      NULLIF(kol->>'kondisi', ''),
      NULLIF(r->'titik'->>'lat', '')::double precision,
      NULLIF(r->'titik'->>'lng', '')::double precision,
      v_nama,
      NULL,
      jsonb_strip_nulls(jsonb_build_object(
        'andongan', kol->'andongan', 'tarikan_sr', kol->'tarikan_sr',
        'arde_kondisi', kol->'arde_kondisi', 'arde_nilai_ohm', kol->'arde_nilai_ohm',
        'stay_jenis', kol->'stay_jenis', 'stay_kondisi', kol->'stay_kondisi',
        'rawan_row', kol->'rawan_row', 'jamperan', kol->'jamperan',
        'underbuild_tm', kol->'underbuild_tm', 'catatan_perbaikan', kol->'catatan_perbaikan',
        'foto_temuan', kol->'foto_temuan')));

    IF jsonb_typeof(r->'konduktor') = 'array' THEN
      kabel := '[]'::jsonb;
      FOR k IN SELECT * FROM jsonb_array_elements(r->'konduktor') LOOP
        kabel := kabel || jsonb_build_array(k || jsonb_build_object(
          'hulu_id', COALESCE(NULLIF(k->>'hulu_id', '')::uuid, public.jtr_id_lokal(peta, k->>'hulu_lokal'))));
      END LOOP;
      PERFORM public.simpan_konduktor_tiang(v_tiang, kabel, v_nama, v_gardu);
    END IF;

    -- Nama JTR di gardu ini (untuk batang pinjaman: nama pinjamannya).
    SELECT kode INTO v_kode FROM public.jtr_tiang
    WHERE id = v_tiang AND upper(gardu_kode) = v_gardu AND status_hidup = 'aktif'
    ORDER BY menumpang LIMIT 1;
    hasil := hasil || jsonb_build_object('id_lokal', r->>'id_lokal', 'tiang_id', v_tiang, 'kode', v_kode);
  END LOOP;

  -- Tutup: fungsi yang sudah ada (mendaftar semua tiang aktif & menutup).
  IF COALESCE((p_isi->>'selesai')::boolean, false) THEN
    v_insp := public.selesaikan_inspeksi_jtr(
      v_gardu, v_ulp, NULLIF(p_isi->>'penyulang', ''), v_nama,
      NULLIF(p_isi->>'petugas_2', ''), NULLIF(btrim(COALESCE(p_isi->>'catatan_selesai', '')), ''));
  END IF;

  RETURN jsonb_build_object('inspeksi_id', v_insp, 'sudah_ada', false, 'tiang', hasil);
END $fn$;

GRANT EXECUTE ON FUNCTION public.kirim_tiang_jtr(JSONB) TO authenticated;


-- ── 5. Rekap: _rekap_kinerja_inti (disalin dari `sla-kinerja.sql`; baris jtr) ─
CREATE OR REPLACE FUNCTION public._rekap_kinerja_inti(p_ulp TEXT, p_tahun INT, p_bulan INT)
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
  -- WO terbit = km gardu dalam WO inspeksi JTR periode ini; `luar_wo` = km
  -- yang selesai tanpa WO (J5 `rencana-mobile-jtm-jtr.md`, keputusan a & e).
  RETURN QUERY
  SELECT 'jtr'::text,
    (SELECT round(COALESCE(sum(i.panjang_km), 0), 3)
       FROM public.wo_inspeksi_item i
       JOIN public.wo_inspeksi w ON w.id = i.wo_id
      WHERE w.jenis = 'JTR' AND i.status <> 'Dibatalkan'
        AND w.tgl_wo >= d_awal AND w.tgl_wo < d_akhr
        AND (u IS NULL OR upper(i.ulp) = u)),
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status IN ('Selesai', 'Diverifikasi')), 0), 3),
    round(COALESCE(sum(pj.km) FILTER (WHERE r.status = 'Selesai'), 0), 3),
    round(COALESCE(sum(pj.km) FILTER (
      WHERE r.status IN ('Selesai', 'Diverifikasi') AND r.wo_item_id IS NULL), 0), 3)
  FROM public.inspeksi_jtr r
  LEFT JOIN LATERAL (
    SELECT sum(g.panjang_km) AS km FROM public.gardu_jtr_penghantar g
    WHERE g.gardu_kode = r.gardu_kode AND g.ulp = r.ulp
  ) pj ON true
  WHERE r.created_at >= t_awal AND r.created_at < t_akhr
    AND (u IS NULL OR upper(r.ulp) = u);
END $$;

GRANT EXECUTE ON FUNCTION public._rekap_kinerja_inti(TEXT, INT, INT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT * FROM master_gardu_jtr WHERE jumlah_tiang > 0;
--   SELECT * FROM gardu_jtr_panjang;             -- sama dengan sebelum skrip
--   SELECT gardu, count(*) FROM jtr_kabel GROUP BY 1;
