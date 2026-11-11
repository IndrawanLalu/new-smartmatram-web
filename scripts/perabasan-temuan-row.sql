-- =============================================================================
-- Temuan ROW pohon ikut WO Perabasan (11 Nov 2026). Jalankan SESUDAH
-- jtm-temuan-cepat.sql, vegetasi-kode-baru.sql, perabasan-tanggal-wita.sql,
-- perabasan-cek.sql. Idempoten.
--
-- Keputusan user 11 Nov:
--   • Hanya item VEGETASI (pohon). Jarak bangunan, layangan, akses regu tetap
--     lewat Tugaskan biasa.
--   • Segmen sedang di-WO-kan → temuan berstatus "Di-WO perabasan".
--     Segmen dirabas & DISETUJUI (Diverifikasi) sesudah temuan dicatat → Selesai.
--   • "Selesai disisir" DITOLAK selama masih ada pohon temuan inspeksi JTM di
--     segmen itu yang belum dirabas. Yang sudah Selesai dari WO sebelumnya
--     tidak wajib lagi; tercatat lagi oleh inspeksi berikutnya → wajib lagi.
--   • Pohon sudah tidak ada / sudah bersih → regu menandai "tidak perlu
--     dirabas": alasan + foto kondisi sekarang (tabel terpisah, TIDAK dihitung
--     sebagai pohon dirabas di rekap/realisasi).
--   • Foto temuan inspeksi dipakai sebagai foto SEBELUM (diatur di HP).
--
-- Patokan "sesudah temuan": tgl_selesai segmen yang Diverifikasi ≥ tanggal
-- temuan (WITA).
-- =============================================================================

-- ── 1. Pohon yang tidak perlu dirabas ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.perabasan_tidak_dirabas (
  id              UUID PRIMARY KEY,                 -- dari HP (butir 17)
  item_id         UUID NOT NULL REFERENCES public.wo_perabasan_item(id) ON DELETE CASCADE,
  tiang_id        UUID NOT NULL REFERENCES public.tiang(id) ON DELETE CASCADE,
  jenis_pohon     TEXT,
  alasan          TEXT NOT NULL CHECK (btrim(alasan) <> ''),
  foto_temuan_url TEXT,                             -- foto inspeksi JTM (sebelum)
  foto_url        TEXT NOT NULL,                    -- kondisi sekarang
  lat             NUMERIC(10,7),
  lng             NUMERIC(10,7),
  petugas_nama    TEXT,
  petugas_uid     UUID,
  dikerjakan_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS perabasan_tidak_dirabas_item_idx ON public.perabasan_tidak_dirabas (item_id);
ALTER TABLE public.perabasan_tidak_dirabas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perabasan_tidak_dirabas_baca ON public.perabasan_tidak_dirabas;
CREATE POLICY perabasan_tidak_dirabas_baca ON public.perabasan_tidak_dirabas FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.perabasan_tidak_dirabas TO authenticated;

COMMENT ON TABLE public.perabasan_tidak_dirabas IS
  'Pohon temuan inspeksi JTM yang didatangi regu tapi tidak perlu dirabas (sudah tidak ada / sudah bersih): alasan + foto kondisi sekarang. Bukan pohon dirabas — tidak ikut hitungan pohon.';

CREATE INDEX IF NOT EXISTS wo_perabasan_item_segmen_status_idx ON public.wo_perabasan_item (segmen_id, status);


-- ── 2. perabasan_pohon: + rabas_disetujui, tertangani ────────────────────────
-- Disalin dari vegetasi-kode-baru.sql (definisi terakhir); dua kolom ★ di akhir.
CREATE OR REPLACE VIEW public.perabasan_pohon AS
WITH per_titik AS (
  SELECT
    tk.tiang_id,
    m.segmen_id                                              AS kabel,
    m.status                                                 AS status_inspeksi,
    COALESCE(m.tgl_selesai, m.tgl_mulai)                     AS tgl,
    max(p.nilai) FILTER (WHERE p.item_kode = 'vegetasi')     AS vegetasi,
    max(p.nilai) FILTER (WHERE p.item_kode = 'jenis_pohon')  AS jenis_pohon,
    max(p.foto_url) FILTER (WHERE p.item_kode = 'vegetasi')  AS foto_url,
    max(p.catatan)  FILTER (WHERE p.item_kode = 'vegetasi')  AS catatan,
    row_number() OVER (
      PARTITION BY tk.tiang_id, m.segmen_id
      ORDER BY COALESCE(m.tgl_selesai, m.tgl_mulai) DESC NULLS LAST, tk.id DESC
    )                                                        AS urut
  FROM public.inspeksi_jtm_titik tk
  JOIN public.inspeksi_jtm m         ON m.id = tk.inspeksi_id
  JOIN public.inspeksi_jtm_periksa p ON p.titik_id = tk.id
  WHERE p.item_kode IN ('vegetasi', 'jenis_pohon')
    AND m.status <> 'Dibatalkan'
  GROUP BY tk.tiang_id, m.segmen_id, tk.id, m.status, m.tgl_selesai, m.tgl_mulai
),
terkini AS (
  SELECT * FROM per_titik WHERE urut = 1
),
pilih AS (
  SELECT DISTINCT ON (st.segmen_id, x.tiang_id)
    st.segmen_id, x.*
  FROM terkini x
  JOIN public.segmen_tiang st ON st.tiang_id = x.tiang_id
  ORDER BY st.segmen_id, x.tiang_id, (x.kabel = st.segmen_id) DESC, x.tgl DESC NULLS LAST
)
SELECT
  x.segmen_id,
  x.tiang_id,
  t.kode  AS tiang_kode,
  t.lat,
  t.lng,
  x.vegetasi,
  x.jenis_pohon,
  x.tgl   AS tgl_inspeksi,
  x.status_inspeksi,
  (x.status_inspeksi = 'Diverifikasi') AS terverifikasi,
  x.foto_url,
  x.catatan,
  -- ★ Rabas segmen ini terakhir yang DISETUJUI, dan apakah itu sesudah pohon ini tercatat.
  rb.tgl  AS rabas_disetujui,
  COALESCE(rb.tgl >= (x.tgl AT TIME ZONE 'Asia/Makassar')::date, false) AS tertangani
FROM pilih x
JOIN public.tiang t ON t.id = x.tiang_id
LEFT JOIN LATERAL (
  SELECT max(wi.tgl_selesai) AS tgl
  FROM public.wo_perabasan_item wi
  WHERE wi.segmen_id = x.segmen_id AND wi.status = 'Diverifikasi'
) rb ON true
WHERE x.vegetasi IN (SELECT o.kode FROM public.jtm_opsi_ref o
                     WHERE o.item_kode = 'vegetasi' AND NOT o.normal);

COMMENT ON VIEW public.perabasan_pohon IS
  'Pohon yang menunggu dirabas per segmen, dari jawaban vegetasi inspeksi JTM KABEL SEGMEN ITU (jatuh ke penyulang lain bila kabelnya belum pernah menjawab), lengkap dengan foto dan koordinat tiangnya. tertangani = segmen sudah dirabas & disetujui sesudah pohon ini tercatat (tidak wajib lagi).';

GRANT SELECT ON public.perabasan_pohon TO authenticated;


-- ── 3. Pohon temuan yang masih wajib dikerjakan di satu segmen WO ────────────
CREATE OR REPLACE FUNCTION public.perabasan_pohon_wajib_sisa(p_item_id UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT count(*)::int
  FROM public.wo_perabasan_item i
  JOIN public.perabasan_pohon p ON p.segmen_id = i.segmen_id
  WHERE i.id = p_item_id
    AND NOT p.tertangani
    AND NOT EXISTS (SELECT 1 FROM public.perabasan_realisasi r WHERE r.item_id = i.id AND r.tiang_id = p.tiang_id)
    AND NOT EXISTS (SELECT 1 FROM public.perabasan_tidak_dirabas d WHERE d.item_id = i.id AND d.tiang_id = p.tiang_id);
$fn$;
GRANT EXECUTE ON FUNCTION public.perabasan_pohon_wajib_sisa(UUID) TO authenticated;


-- ── 4. simpan_pohon_perabasan: + baris "tidak perlu dirabas" ─────────────────
-- Disalin dari perabasan-tanggal-wita.sql; perubahan ditandai ★. Baris dengan
-- `tidak_dirabas` (alasan) masuk perabasan_tidak_dirabas; foto_sesudah_url =
-- foto kondisi sekarang, foto_sebelum_url = foto temuan (boleh kosong).
CREATE OR REPLACE FUNCTION public.simpan_pohon_perabasan(p_item_id uuid, p_pohon jsonb, p_petugas text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  it     RECORD;
  v_role TEXT;
  v_unit TEXT;
  r      JSONB;
  n      INT := 0;
  v_cek  UUID;
  v_alasan TEXT;   -- ★
BEGIN
  SELECT * INTO it FROM public.wo_perabasan_item WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen WO tidak ditemukan.'; END IF;

  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(it.ulp) THEN
    RAISE EXCEPTION 'Akun ini untuk ULP %, segmen ini milik ULP %.', COALESCE(v_unit, '-'), it.ulp;
  END IF;

  IF it.status NOT IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak') THEN
    RAISE EXCEPTION 'Segmen % sudah dilaporkan selesai (%). Pohon tambahan tidak bisa dikirim lagi — minta admin mengembalikannya bila perlu.',
      it.segmen_nama, it.status;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_pohon, '[]'::jsonb)) LOOP
    IF NULLIF(r->>'id', '') IS NULL THEN
      RAISE EXCEPTION 'Pohon tanpa id — perbarui aplikasi lalu kirim ulang.';
    END IF;

    -- ★ Tidak perlu dirabas: hanya pohon dari daftar inspeksi, alasan + foto kondisi sekarang.
    v_alasan := NULLIF(btrim(COALESCE(r->>'tidak_dirabas', '')), '');
    IF v_alasan IS NOT NULL THEN
      IF NULLIF(r->>'tiang_id', '') IS NULL THEN
        RAISE EXCEPTION '"Tidak perlu dirabas" hanya untuk pohon dari daftar inspeksi.';
      END IF;
      IF COALESCE(r->>'foto_sesudah_url', '') NOT LIKE 'http%' THEN
        RAISE EXCEPTION 'Foto kondisi sekarang belum terunggah. Kirim ulang saat sinyal lebih baik.';
      END IF;
      DELETE FROM public.perabasan_realisasi WHERE id = (r->>'id')::uuid AND item_id = p_item_id;
      INSERT INTO public.perabasan_tidak_dirabas AS d (
        id, item_id, tiang_id, jenis_pohon, alasan, foto_temuan_url, foto_url, lat, lng,
        petugas_nama, petugas_uid, dikerjakan_at
      ) VALUES (
        (r->>'id')::uuid, p_item_id, (r->>'tiang_id')::uuid, NULLIF(btrim(r->>'jenis_pohon'), ''), v_alasan,
        NULLIF(r->>'foto_sebelum_url', ''), r->>'foto_sesudah_url',
        NULLIF(r->>'lat', '')::numeric, NULLIF(r->>'lng', '')::numeric,
        p_petugas, auth.uid(),
        LEAST(COALESCE(NULLIF(r->>'dikerjakan_at', '')::timestamptz, now()), now())
      )
      ON CONFLICT (id) DO UPDATE SET
        tiang_id = EXCLUDED.tiang_id,
        jenis_pohon = EXCLUDED.jenis_pohon,
        alasan = EXCLUDED.alasan,
        foto_temuan_url = EXCLUDED.foto_temuan_url,
        foto_url = EXCLUDED.foto_url,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng
      WHERE d.item_id = p_item_id;
      n := n + 1;
      CONTINUE;
    END IF;
    DELETE FROM public.perabasan_tidak_dirabas WHERE id = (r->>'id')::uuid AND item_id = p_item_id;   -- ★

    IF COALESCE(r->>'foto_sebelum_url', '') NOT LIKE 'http%' OR COALESCE(r->>'foto_sesudah_url', '') NOT LIKE 'http%' THEN
      RAISE EXCEPTION 'Foto pohon belum terunggah. Kirim ulang saat sinyal lebih baik.';
    END IF;

    v_cek := NULLIF(r->>'cek_pohon_id', '')::uuid;
    IF v_cek IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.perabasan_cek_pohon c WHERE c.id = v_cek AND c.item_id = p_item_id) THEN
        RAISE EXCEPTION 'Pohon hasil pengecekan itu bukan milik segmen ini. Muat ulang segmen lalu kirim ulang.';
      END IF;
      IF EXISTS (SELECT 1 FROM public.perabasan_realisasi x
                  WHERE x.cek_pohon_id = v_cek AND x.id <> (r->>'id')::uuid) THEN
        RAISE EXCEPTION 'Pohon hasil pengecekan itu sudah dirabas dan terkirim. Muat ulang segmen.';
      END IF;
    END IF;

    INSERT INTO public.perabasan_realisasi AS pr (
      id, item_id, tiang_id, jenis_pohon, lat, lng,
      foto_sebelum_url, foto_sesudah_url, petugas_nama, petugas_uid, dikerjakan_at, catatan,
      cek_pohon_id
    ) VALUES (
      (r->>'id')::uuid, p_item_id, NULLIF(r->>'tiang_id', '')::uuid,
      NULLIF(btrim(r->>'jenis_pohon'), ''),
      NULLIF(r->>'lat', '')::numeric, NULLIF(r->>'lng', '')::numeric,
      r->>'foto_sebelum_url', r->>'foto_sesudah_url',
      p_petugas, auth.uid(),
      LEAST(COALESCE(NULLIF(r->>'dikerjakan_at', '')::timestamptz, now()), now()),
      NULLIF(btrim(r->>'catatan'), ''),
      v_cek
    )
    ON CONFLICT (id) DO UPDATE SET
      tiang_id = EXCLUDED.tiang_id,
      jenis_pohon = EXCLUDED.jenis_pohon,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      foto_sebelum_url = EXCLUDED.foto_sebelum_url,
      foto_sesudah_url = EXCLUDED.foto_sesudah_url,
      catatan = EXCLUDED.catatan,
      cek_pohon_id = EXCLUDED.cek_pohon_id
    WHERE pr.item_id = p_item_id;
    n := n + 1;
  END LOOP;

  UPDATE public.wo_perabasan_item
  SET status = CASE WHEN status = 'Dijadwalkan' THEN 'Dalam Proses' ELSE status END,
      tgl_mulai = COALESCE(tgl_mulai, (now() AT TIME ZONE 'Asia/Makassar')::date),
      petugas_nama = COALESCE(p_petugas, petugas_nama),
      petugas_uid = COALESCE(auth.uid(), petugas_uid),
      updated_at = now()
  WHERE id = p_item_id;

  RETURN n;
END $function$;


-- ── 5. hapus_pohon_perabasan: juga baris "tidak perlu dirabas" ───────────────
CREATE OR REPLACE FUNCTION public.hapus_pohon_perabasan(p_pohon_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it     RECORD;
  v_role TEXT;
  v_unit TEXT;
BEGIN
  SELECT i.* INTO it
  FROM (SELECT item_id FROM public.perabasan_realisasi WHERE id = p_pohon_id
        UNION ALL
        SELECT item_id FROM public.perabasan_tidak_dirabas WHERE id = p_pohon_id) p   -- ★
  JOIN public.wo_perabasan_item i ON i.id = p.item_id
  LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF; -- sudah tidak ada = tujuan tercapai

  SELECT role, unit INTO v_role, v_unit FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role IS NULL OR (v_role <> 'UP3' AND upper(COALESCE(v_unit, '')) <> upper(it.ulp)) THEN
    RAISE EXCEPTION 'Tidak berhak menghapus pohon di segmen ULP %.', it.ulp;
  END IF;
  IF it.status NOT IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak') THEN
    RAISE EXCEPTION 'Segmen % sudah dilaporkan selesai — pohonnya tidak bisa dihapus dari HP.', it.segmen_nama;
  END IF;

  DELETE FROM public.perabasan_realisasi WHERE id = p_pohon_id;
  DELETE FROM public.perabasan_tidak_dirabas WHERE id = p_pohon_id;   -- ★
END $fn$;
GRANT EXECUTE ON FUNCTION public.hapus_pohon_perabasan(UUID) TO authenticated;


-- ── 6. selesaikan_perabasan_segmen: pohon temuan wajib dikerjakan ────────────
-- Disalin dari perabasan-tanggal-wita.sql; perubahan ditandai ★.
CREATE OR REPLACE FUNCTION public.selesaikan_perabasan_segmen(p_item_id uuid, p_catatan text DEFAULT NULL::text, p_petugas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n     INT;
  sisa  INT;
BEGIN
  SELECT count(*) INTO n FROM public.perabasan_realisasi WHERE item_id = p_item_id;

  SELECT count(*) INTO sisa
  FROM public.perabasan_cek_pohon c
  WHERE c.item_id = p_item_id
    AND NOT EXISTS (SELECT 1 FROM public.perabasan_realisasi x WHERE x.cek_pohon_id = c.id);
  IF sisa > 0 THEN
    RAISE EXCEPTION 'Masih ada % pohon hasil pengecekan yang belum dirabas di segmen ini. Rabas dan kirim semuanya dulu.', sisa;
  END IF;

  -- ★ Keputusan user 11 Nov 2026: pohon temuan inspeksi JTM wajib dirabas
  --   (atau ditandai tidak perlu dirabas) sebelum segmen ditutup.
  sisa := public.perabasan_pohon_wajib_sisa(p_item_id);
  IF sisa > 0 THEN
    RAISE EXCEPTION 'Masih ada % pohon temuan inspeksi JTM yang belum dirabas di segmen ini. Rabas, atau tandai "tidak perlu dirabas", lalu kirim semuanya dulu.', sisa;
  END IF;

  n := n + (SELECT count(*) FROM public.perabasan_tidak_dirabas WHERE item_id = p_item_id);   -- ★
  IF n = 0 AND btrim(COALESCE(p_catatan, '')) = '' THEN
    RAISE EXCEPTION
      'Tidak ada satu pohon pun yang dilaporkan di segmen ini. Kalau ruasnya memang bersih, tuliskan itu di catatan — laporan kosong tanpa keterangan tidak bisa dibedakan dari pekerjaan yang belum dikerjakan.';
  END IF;

  UPDATE public.wo_perabasan_item
  SET status = 'Selesai',
      tgl_selesai = (now() AT TIME ZONE 'Asia/Makassar')::date,
      tgl_mulai = COALESCE(tgl_mulai, (now() AT TIME ZONE 'Asia/Makassar')::date),
      catatan = COALESCE(NULLIF(btrim(COALESCE(p_catatan, '')), ''), catatan),
      petugas_nama = COALESCE(p_petugas, petugas_nama),
      petugas_uid = COALESCE(auth.uid(), petugas_uid),
      updated_at = now()
  WHERE id = p_item_id AND status IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Segmen ini sudah dilaporkan selesai atau sudah diverifikasi.';
  END IF;

  RETURN jsonb_build_object('item_id', p_item_id, 'pohon', n);
END $function$;


-- ── 7. jtm_temuan: status vegetasi ikut WO Perabasan ─────────────────────────
-- Disalin dari jtm-temuan-cepat.sql; kolom SAMA, hanya status_tugas berubah ★.
CREATE OR REPLACE VIEW public.jtm_temuan AS
SELECT
  k.tiang_id,
  k.tiang_kode,
  k.pemilik               AS penyulang,
  k.ulp,
  k.item_kode,
  k.item_nama,
  k.kelompok,
  CASE WHEN k.kelompok = 'ROW' THEN 'ROW' ELSE 'Jaringan' END AS jenis,
  k.bagian,
  k.sirkit_segmen_id,
  k.sirkit_nama,
  k.nilai,
  k.nilai_label,
  k.catatan,
  k.foto_url,
  k.tgl                   AS ditemukan_pada,
  k.inspeksi_id           AS inspeksi_jtm_id,
  m.petugas_nama          AS penemu,
  seg.segmen_id,
  seg.segmen_nama,
  t.lat,
  t.lng,
  tg.id                   AS tugas_id,
  tg.status               AS tugas_status,
  tg.eksekutor,
  tg.category             AS prioritas,
  tg.assigned_at,
  tg.team_name,
  tg.foto_sesudah_url,
  tg.updated_at           AS tugas_diperbarui,
  CASE
    WHEN tg.status = 'Selesai' AND k.tgl <= tg.updated_at THEN 'Selesai'
    -- ★ Pohon: segmen dirabas & disetujui sesudah temuan dicatat.
    WHEN k.item_kode = 'vegetasi' AND rb.tgl >= (k.tgl AT TIME ZONE 'Asia/Makassar')::date THEN 'Selesai'
    WHEN tg.id IS NOT NULL AND tg.status NOT IN ('Batal', 'Temuan', 'Selesai') THEN 'Ditugaskan'
    -- ★ Pohon: segmennya sedang dipegang WO Perabasan.
    WHEN k.item_kode = 'vegetasi' AND wo.nama IS NOT NULL THEN 'Di-WO perabasan'
    ELSE 'Belum ditugaskan'
  END                     AS status_tugas,
  wo.nama                 AS wo_perabasan_aktif,
  kt.kategori_temuan
FROM (
  SELECT j.tiang_id, t0.kode AS tiang_kode, t0.penyulang AS pemilik, j.ulp, j.item_kode, i.nama AS item_nama,
         i.kelompok, j.bagian, j.sirkit_segmen_id, s.nama AS sirkit_nama, j.nilai, o.label AS nilai_label,
         j.catatan, j.foto_url, j.tgl, j.inspeksi_id
  FROM public.jtm_opsi_ref o
  JOIN public.kondisi_tiang_terakhir j ON j.item_kode = o.item_kode AND j.nilai = o.kode
  JOIN public.tiang t0        ON t0.id = j.tiang_id
  JOIN public.jtm_item_ref i  ON i.kode = j.item_kode
  LEFT JOIN public.segmen s   ON s.id = j.sirkit_segmen_id
  WHERE NOT o.normal
) k
JOIN public.tiang t ON t.id = k.tiang_id
LEFT JOIN public.inspeksi_jtm m ON m.id = k.inspeksi_id
LEFT JOIN LATERAL (
  SELECT s.id AS segmen_id, s.nama AS segmen_nama
  FROM public.segmen_tiang st
  JOIN public.segmen s ON s.id = st.segmen_id
  WHERE st.tiang_id = k.tiang_id AND s.status = 'aktif'
  ORDER BY (s.id = m.segmen_id) DESC NULLS LAST, s.nama
  LIMIT 1
) seg ON true
LEFT JOIN LATERAL (
  SELECT x.id, x.status, x.eksekutor, x.category, x.assigned_at, x.team_name, x.foto_sesudah_url, x.updated_at
  FROM (
    SELECT i.id, i.status, i.eksekutor, i.category, i.assigned_at, i.team_name, i.foto_sesudah_url, i.updated_at, i.created_at
    FROM public.inspeksi i
    WHERE i.sumber_tiang_id = k.tiang_id
      AND i.sumber_item = k.item_kode
      AND i.sumber_bagian IS NOT DISTINCT FROM k.bagian
      AND i.sumber_sirkit_id IS NOT DISTINCT FROM k.sirkit_segmen_id
    UNION ALL
    SELECT p.id, p.status, p.eksekutor, p.category, p.assigned_at, p.team_name, p.foto_sesudah_url, p.updated_at, p.created_at
    FROM public.inspeksi_pohon p
    WHERE p.sumber_tiang_id = k.tiang_id
      AND p.sumber_item = k.item_kode
      AND p.sumber_bagian IS NOT DISTINCT FROM k.bagian
      AND p.sumber_sirkit_id IS NOT DISTINCT FROM k.sirkit_segmen_id
  ) x
  ORDER BY x.created_at DESC
  LIMIT 1
) tg ON true
LEFT JOIN LATERAL (
  SELECT w.nama
  FROM public.wo_perabasan_item wi
  JOIN public.wo_perabasan w ON w.id = wi.wo_id
  WHERE k.kelompok = 'ROW'
    AND wi.segmen_id = seg.segmen_id
    AND w.status = 'Terbit'
    AND wi.status NOT IN ('Diverifikasi', 'Dibatalkan')
  LIMIT 1
) wo ON true
-- ★ Rabas segmen ini terakhir yang disetujui (pohon saja).
LEFT JOIN LATERAL (
  SELECT max(wi.tgl_selesai) AS tgl
  FROM public.wo_perabasan_item wi
  WHERE k.item_kode = 'vegetasi'
    AND wi.segmen_id = seg.segmen_id
    AND wi.status = 'Diverifikasi'
) rb ON true
LEFT JOIN LATERAL (
  SELECT p.kategori_temuan
  FROM public.inspeksi_jtm_titik tk
  JOIN public.inspeksi_jtm_periksa p ON p.titik_id = tk.id
  WHERE tk.inspeksi_id = k.inspeksi_id AND tk.tiang_id = k.tiang_id
    AND p.item_kode = k.item_kode AND p.bagian = k.bagian
    AND p.sirkit_segmen_id IS NOT DISTINCT FROM k.sirkit_segmen_id
    AND p.kategori_temuan IS NOT NULL
  LIMIT 1
) kt ON true;

GRANT SELECT ON public.jtm_temuan TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT status_tugas, count(*) FROM jtm_temuan WHERE item_kode = 'vegetasi' GROUP BY 1;
--   SELECT count(*) FILTER (WHERE tertangani) FROM perabasan_pohon;
