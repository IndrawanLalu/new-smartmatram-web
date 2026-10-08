-- =============================================================================
-- JTR F4 — web: jurusan kabel dari web, kunci tugas temuan yang tetap (8 Okt 2026)
-- `rencana-jtr-jurusan-kabel.md` F4. Jalankan manual di Supabase SQL Editor,
-- SESUDAH `jtr-jurusan-kabel.sql` (F2). Idempoten. Tidak mengubah data.
--
--   1. atur_jurusan_kabel_jtr     — admin memastikan / mengganti jurusan satu
--                                   kabel (daftar "belum dipastikan", peta)
--   2. jtr_kabel_perlu_dipastikan — + pilihan jurusan di tiang itu
--   3. jtr_tiang_lengkap          — kabel membawa jurusannya (Hasil Inspeksi,
--                                   Excel)
--   4. kunci tugas temuan JTR     — dulu NAMA TIANG; nama tiang bersama berubah
--      (A4 → A4/B5) saat jurusan lain dicatat lewat, dan F5 menamai ulang —
--      tugasnya lalu terlepas, temuannya tampil "Belum ditugaskan" lagi dan
--      bisa ditugaskan dua kali. Kini 'tiang' / 'kabel:<id kabel>'. Tugas lama
--      yang berkunci nama tetap dikenali.
--
-- Definisi yang diganti DISALIN dari yang TERPASANG (`_definisi`, 8 Okt) dan
-- dari F2; yang baru bertanda ★.
-- =============================================================================


-- ── 1. Jurusan satu kabel (admin) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.atur_jurusan_kabel_jtr(
  p_tiang_id UUID,
  p_gardu    TEXT,
  p_nomor    INT,
  p_jurusan  TEXT,
  p_oleh     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_gardu TEXT := upper(btrim(COALESCE(p_gardu, '')));
  jur     TEXT := upper(btrim(COALESCE(p_jurusan, '')));
  t_kode  TEXT;
  t_ulp   TEXT;
  k_id    UUID;
  k_lama  TEXT;
  ada     TEXT;
BEGIN
  SELECT j.kode, j.ulp INTO t_kode, t_ulp FROM public.jtr_tiang j
  WHERE j.id = p_tiang_id AND upper(j.gardu_kode) = v_gardu AND j.status_hidup = 'aktif'
  ORDER BY j.menumpang LIMIT 1;
  IF t_kode IS NULL THEN RAISE EXCEPTION 'Tiang bukan bagian jaringan gardu %', v_gardu; END IF;
  PERFORM public.wajib_boleh_ulp(t_ulp);

  IF NOT EXISTS (SELECT 1 FROM public.jtr_tiang_jurusan
                 WHERE id = p_tiang_id AND gardu_kode = v_gardu AND jurusan = jur AND status_hidup = 'aktif') THEN
    SELECT string_agg(jurusan, ', ' ORDER BY utama DESC, jurusan) INTO ada FROM public.jtr_tiang_jurusan
    WHERE id = p_tiang_id AND gardu_kode = v_gardu AND status_hidup = 'aktif';
    RAISE EXCEPTION 'Tiang % tidak dilewati jurusan % (yang lewat: %). Jurusan lain dicatat regu dari HP: "Dilewati jurusan % juga".',
      t_kode, COALESCE(NULLIF(jur, ''), '-'), COALESCE(ada, '-'), COALESCE(NULLIF(jur, ''), '…');
  END IF;

  SELECT kk.id, kk.jurusan INTO k_id, k_lama
  FROM public.jtr_kabel kb JOIN public.tiang_konduktor kk ON kk.id = kb.id
  WHERE kb.tiang_id = p_tiang_id AND kb.gardu = v_gardu AND kb.nomor = p_nomor;
  IF k_id IS NULL THEN RAISE EXCEPTION 'Tiang % tidak punya kabel ke-% gardu %', t_kode, p_nomor, v_gardu; END IF;

  UPDATE public.tiang_konduktor SET jurusan = jur, updated_at = now() WHERE id = k_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('tiang', t_kode, COALESCE(t_ulp, '-'), 'jurusan_kabel_' || p_nomor,
          to_jsonb(k_lama), to_jsonb(jur), 'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('kode', t_kode, 'nomor', p_nomor, 'jurusan', jur);
END $fn$;
GRANT EXECUTE ON FUNCTION public.atur_jurusan_kabel_jtr(UUID, TEXT, INT, TEXT, TEXT) TO authenticated;


-- ── 2. Daftar "belum dipastikan" + pilihan jurusannya ────────────────────────
-- Kolom F2 tetap; ★ pilihan_jurusan (jurusan utama lebih dulu) di belakang.
CREATE OR REPLACE VIEW public.jtr_kabel_perlu_dipastikan AS
SELECT k.gardu AS gardu_kode,
       upper(t.ulp) AS ulp,
       k.tiang_id,
       t.kode AS tiang_kode,
       k.id AS konduktor_id,
       k.nomor AS nomor_kabel,
       k.jurusan AS jurusan_dianggap,
       ARRAY(SELECT j.jurusan FROM public.jtr_tiang_jurusan j
              WHERE j.id = k.tiang_id AND j.gardu_kode = k.gardu AND j.status_hidup = 'aktif'
              ORDER BY j.utama DESC, j.jurusan) AS pilihan_jurusan
FROM public.jtr_kabel k
JOIN public.tiang_konduktor kk ON kk.id = k.id AND kk.jurusan IS NULL
JOIN public.jtr_tiang t ON t.id = k.tiang_id AND upper(t.gardu_kode) = k.gardu AND t.status_hidup = 'aktif'
WHERE EXISTS (SELECT 1 FROM public.jtr_kabel k2
              WHERE k2.tiang_id = k.tiang_id AND k2.gardu = k.gardu
                AND k2.jurusan IS NOT DISTINCT FROM k.jurusan AND k2.nomor < k.nomor);
GRANT SELECT ON public.jtr_kabel_perlu_dipastikan TO authenticated;


-- ── 3. Tiang lengkap: ★ jurusan per kabel ────────────────────────────────────
CREATE OR REPLACE VIEW public.jtr_tiang_lengkap AS
 SELECT j.id,
    j.kode,
    j.gardu_kode,
    j.ulp,
    j.jurusan,
    j.induk_id,
    j.lat,
    j.lng,
    j.status_hidup,
    j.created_at,
    j.jenis,
    j.tinggi,
    j.kondisi,
    j.jamperan,
    j.andongan,
    j.tarikan_sr,
    j.arde_kondisi,
    j.arde_nilai_ohm,
    j.stay_jenis,
    j.stay_kondisi,
    j.rawan_row,
    j.underbuild_tm,
    j.catatan_perbaikan,
    j.foto_temuan,
    j.dikonfirmasi_at,
    t.dikonfirmasi_oleh,
    t.aktif_sampai,
    j.menumpang,
    j.tumpang_id,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('nomor', k.nomor, 'jenis', k.jenis, 'ukuran', k.ukuran, 'kondisi', k.kondisi, 'jurusan', k.jurusan, 'induk_tiang_id', k.induk_tiang_id, 'aks_suspension', k.aks_suspension, 'aks_large_angle', k.aks_large_angle, 'aks_dead_end', k.aks_dead_end, 'foto_temuan', k.foto_temuan) ORDER BY k.nomor) AS jsonb_agg
           FROM jtr_kabel k
          WHERE k.tiang_id = j.id AND k.gardu = upper(j.gardu_kode)), '[]'::jsonb) AS tiang_konduktor
   FROM jtr_tiang j
     JOIN tiang t ON t.id = j.id;
GRANT SELECT ON public.jtr_tiang_lengkap TO authenticated;


-- ── 4. Kunci tugas temuan JTR ────────────────────────────────────────────────
-- inspeksi_jtr_temuan versi F2, ★ + kolom kunci_bagian di belakang.
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
            k.jurusan,
                CASE
                    WHEN u.ke = 1 THEN COALESCE(n.kode, d.tiang_kode)
                    ELSE (COALESCE(n.kode, d.tiang_kode) || '.'::text) || u.ke
                END AS tiang_kode,
            k.id AS konduktor_id,
            k.kondisi AS kabel_kondisi,
            k.aks_suspension,
            k.aks_large_angle,
            k.aks_dead_end,
            k.foto_temuan
           FROM dasar d
             JOIN jtr_kabel k ON k.tiang_id = d.tiang_id AND k.gardu = upper(d.gardu_kode)
             LEFT JOIN LATERAL ( SELECT j.kode
                   FROM jtr_tiang_jurusan j
                  WHERE j.id = d.tiang_id AND j.gardu_kode = k.gardu AND j.jurusan = k.jurusan
                  ORDER BY (j.status_hidup = 'aktif'::text) DESC, j.utama DESC
                 LIMIT 1) n ON true
             CROSS JOIN LATERAL ( SELECT count(*) + 1 AS ke
                   FROM jtr_kabel k2
                  WHERE k2.tiang_id = k.tiang_id AND k2.gardu = k.gardu AND NOT k2.jurusan IS DISTINCT FROM k.jurusan AND k2.nomor < k.nomor) u
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
    foto_url,
    kunci_bagian
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
            dasar.foto_temuan ->> 'kondisi'::text AS foto_url,
            'tiang'::text AS kunci_bagian
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
            dasar.foto_temuan ->> 'ardeKondisi'::text,
            'tiang'::text AS kunci_bagian
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
            dasar.foto_temuan ->> 'andongan'::text,
            'tiang'::text AS kunci_bagian
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
            dasar.foto_temuan ->> 'stayKondisi'::text,
            'tiang'::text AS kunci_bagian
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
            dasar.foto_temuan ->> 'rawanRow'::text,
            'tiang'::text AS kunci_bagian
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
            dasar.foto_temuan ->> 'jamperanKondisi'::text,
            'tiang'::text AS kunci_bagian
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
            NULL::text AS text,
            'tiang'::text AS kunci_bagian
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
            kabel.foto_temuan ->> 'konduktorKondisi'::text,
            'kabel:'::text || kabel.konduktor_id AS kunci_bagian
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
            kabel.foto_temuan ->> 'aksSuspension'::text,
            'kabel:'::text || kabel.konduktor_id AS kunci_bagian
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
            kabel.foto_temuan ->> 'aksLargeAngle'::text,
            'kabel:'::text || kabel.konduktor_id AS kunci_bagian
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
            kabel.foto_temuan ->> 'aksDeadEnd'::text,
            'kabel:'::text || kabel.konduktor_id AS kunci_bagian
           FROM kabel
          WHERE kabel.aks_dead_end IS NOT NULL AND NOT jtr_normal('kondisi_aksesoris'::text, kabel.aks_dead_end)) s;

-- ★ Tugas dikenali lewat kunci; tugas lama berkunci nama tiang tetap dikenali.
CREATE OR REPLACE VIEW public.jtr_temuan AS
 WITH terakhir AS (
         SELECT DISTINCT ON ((upper(inspeksi_jtr.gardu_kode)), (upper(inspeksi_jtr.ulp))) inspeksi_jtr.id,
            inspeksi_jtr.inspektor_nama,
            inspeksi_jtr.tgl_mulai
           FROM inspeksi_jtr
          WHERE inspeksi_jtr.status = 'Diverifikasi'::text
          ORDER BY (upper(inspeksi_jtr.gardu_kode)), (upper(inspeksi_jtr.ulp)), inspeksi_jtr.tgl_selesai DESC NULLS LAST, inspeksi_jtr.created_at DESC
        )
 SELECT x.tiang_id,
    x.tiang_kode,
    upper(x.gardu_kode) AS gardu_kode,
    upper(x.ulp) AS ulp,
    COALESCE(x.penyulang, g.feeder) AS penyulang,
    g.nama AS gardu_nama,
    x.jurusan,
    x.temuan,
    x.urgensi,
    x.foto_url,
    x.inspeksi_id AS inspeksi_jtr_id,
    r.tgl_mulai AS ditemukan_pada,
    r.inspektor_nama AS penemu,
    t.lat,
    t.lng,
    tg.id AS tugas_id,
    tg.status AS tugas_status,
    tg.eksekutor,
    tg.category AS prioritas,
    tg.assigned_at,
    tg.team_name,
    tg.foto_sesudah_url,
        CASE
            WHEN tg.id IS NULL OR tg.status = 'Batal'::text THEN 'Belum ditugaskan'::text
            WHEN tg.status = 'Selesai'::text AND (r.tgl_mulai::timestamp without time zone AT TIME ZONE 'Asia/Makassar'::text) > tg.updated_at THEN 'Belum ditugaskan'::text
            WHEN tg.status = 'Selesai'::text THEN 'Selesai'::text
            ELSE 'Ditugaskan'::text
        END AS status_tugas,
    x.kunci_bagian
   FROM inspeksi_jtr_temuan x
     JOIN terakhir r ON r.id = x.inspeksi_id
     JOIN tiang t ON t.id = x.tiang_id
     LEFT JOIN gardu g ON upper(g.kode) = upper(x.gardu_kode) AND upper(g.ulp) = upper(x.ulp)
     LEFT JOIN LATERAL ( SELECT i.id,
            i.status,
            i.eksekutor,
            i.category,
            i.assigned_at,
            i.team_name,
            i.foto_sesudah_url,
            i.updated_at
           FROM inspeksi i
          WHERE i.sumber_tiang_id = x.tiang_id AND i.sumber_item = ('jtr:'::text || x.temuan) AND (i.sumber_bagian = x.kunci_bagian OR NOT i.sumber_bagian IS DISTINCT FROM x.tiang_kode)
          ORDER BY i.created_at DESC
         LIMIT 1) tg ON true;

CREATE OR REPLACE FUNCTION public.tugaskan_temuan_jtr(p_tiang_id uuid, p_tiang_kode text, p_temuan text, p_eksekutor text, p_prioritas text DEFAULT 'Normal'::text, p_catatan text DEFAULT NULL::text, p_nama text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  k    RECORD;
  baru TEXT;
BEGIN
  -- Dua admin menekan bersamaan tidak boleh melahirkan dua tugas.
  PERFORM pg_advisory_xact_lock(hashtext(concat_ws('|', 'tugas-jtr', p_tiang_id, p_tiang_kode, p_temuan)));

  SELECT * INTO k FROM public.jtr_temuan
  WHERE tiang_id = p_tiang_id AND tiang_kode = p_tiang_kode AND temuan = p_temuan
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Temuan ini tidak ada lagi — mungkin inspeksi terakhir sudah mencatatnya normal. Muat ulang daftar.';
  END IF;

  PERFORM public.wajib_boleh_ulp(k.ulp);

  IF k.status_tugas = 'Ditugaskan' THEN
    RAISE EXCEPTION 'Temuan % (%) sudah ditugaskan ke % — satu temuan satu tugas.', k.tiang_kode, k.temuan, k.eksekutor;
  END IF;
  IF k.status_tugas = 'Selesai' THEN
    RAISE EXCEPTION 'Temuan % (%) sudah dikerjakan % — tunggu inspeksi berikutnya memastikannya normal.',
      k.tiang_kode, k.temuan, k.eksekutor;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE code = p_eksekutor AND is_eksekutor) THEN
    RAISE EXCEPTION 'Eksekutor % tidak dikenal atau bukan regu pelaksana.', COALESCE(p_eksekutor, '-');
  END IF;
  IF p_prioritas NOT IN ('Normal', 'Scheduled', 'Urgent', 'Emergency') THEN
    RAISE EXCEPTION 'Prioritas % tidak dikenal.', COALESCE(p_prioritas, '-');
  END IF;

  INSERT INTO public.inspeksi (
    category, deskripsi, temuan, lokasi, ulp, penyulang,
    inspektor, nama_inspektor, inspektor_or_petugas,
    koordinat, foto_sebelum_url, image_url,
    status, eksekutor, assigned_at, tgl_inspeksi,
    keterangan, source, updated_by,
    sumber_tiang_id, sumber_item, sumber_bagian
  ) VALUES (
    p_prioritas,
    concat_ws(' — ', 'JTR ' || k.temuan, 'urgensi ' || lower(k.urgensi)),
    k.temuan,
    concat_ws(' · ', 'Tiang ' || k.tiang_kode, 'Gardu ' || k.gardu_kode || COALESCE(' ' || k.gardu_nama, '')),
    k.ulp,
    k.penyulang,
    k.penemu, k.penemu, k.penemu,
    CASE WHEN k.lat IS NOT NULL AND k.lng IS NOT NULL THEN k.lat || ', ' || k.lng END,
    k.foto_url, k.foto_url,
    -- Eksekutor lewat UPDATE di bawah: pemicu push notifikasi HP hanya menyala
    -- saat UPDATE yang mengisi eksekutor dari kosong (sepola tugaskan_temuan_jtm).
    'Ditugaskan', '', now(),
    k.ditemukan_pada,
    NULLIF(btrim(p_catatan), ''), 'inspeksi_jtr', p_nama,
    k.tiang_id, 'jtr:' || k.temuan, k.kunci_bagian   -- ★ dulu nama tiang
  )
  RETURNING id INTO baru;

  UPDATE public.inspeksi SET eksekutor = p_eksekutor WHERE id = baru;
  RETURN baru;
END $function$
;

GRANT SELECT ON public.inspeksi_jtr_temuan, public.jtr_temuan TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT gardu_kode, tiang_kode, nomor_kabel, pilihan_jurusan FROM jtr_kabel_perlu_dipastikan LIMIT 10;
--   SELECT kunci_bagian, count(*) FROM jtr_temuan GROUP BY 1 ORDER BY 2 DESC LIMIT 5;
