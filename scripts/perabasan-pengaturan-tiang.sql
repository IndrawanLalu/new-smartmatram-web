-- =============================================================================
-- Perabasan: sakelar "pohon temuan wajib dirabas" per ULP + tiang kerja tiap
-- pohon (24 Nov 2026). Jalankan SESUDAH perabasan-temuan-row.sql. Idempoten.
--
-- Keputusan user 24 Nov:
--   • Pohon temuan inspeksi JTM wajib dirabas sebelum "Selesai disisir" kini
--     DIATUR PER ULP, BAWAAN = TIDAK WAJIB (boleh tidak dirabas). Yang mengubah
--     hanya UP3.
--   • Setiap pohon yang dirabas HARUS punya tiang di segmen WO-nya — bawaannya
--     tiang terdekat dari titik pohon — supaya regu tidak merabas di luar
--     segmennya. Disimpan di kolom baru `tiang_kerja_id`; `tiang_id` tetap
--     berarti "pohon dari daftar inspeksi" (NULL = temuan lapangan), jadi
--     hitungan & label yang memakainya tidak berubah.
--   • Segmen yang sama sekali belum punya tiang (WO tempelan lama) dikecualikan:
--     tidak ada tiang yang bisa dipilih.
--   • Server TIDAK menolak kiriman karena tiang (pekerjaan berjalan tidak boleh
--     tertahan); yang mewajibkan & memperingatkan jarak adalah formulir HP.
--
-- Urutan rilis: SQL ini → push web → OTA HP. HP lama tetap bisa mengirim:
-- tiang kerjanya dicarikan server dari titik pohon.
-- =============================================================================

-- ── 1. Pengaturan per ULP ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.perabasan_pengaturan (
  ulp          TEXT PRIMARY KEY,
  pohon_wajib  BOOLEAN NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_oleh TEXT
);
ALTER TABLE public.perabasan_pengaturan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perabasan_pengaturan_baca ON public.perabasan_pengaturan;
CREATE POLICY perabasan_pengaturan_baca ON public.perabasan_pengaturan FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.perabasan_pengaturan TO authenticated;

COMMENT ON TABLE public.perabasan_pengaturan IS
  'Pengaturan perabasan per ULP. pohon_wajib = pohon temuan inspeksi JTM wajib dirabas (atau ditandai tidak perlu dirabas) sebelum segmen Selesai disisir. Tidak ada baris = tidak wajib. Diubah UP3.';

CREATE OR REPLACE FUNCTION public.perabasan_pohon_wajib(p_ulp TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE((SELECT pohon_wajib FROM public.perabasan_pengaturan WHERE ulp = upper(p_ulp)), false);
$fn$;
GRANT EXECUTE ON FUNCTION public.perabasan_pohon_wajib(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.simpan_perabasan_pengaturan(p_ulp TEXT, p_pohon_wajib BOOLEAN, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'UP3') THEN
    RAISE EXCEPTION 'Pengaturan perabasan hanya bisa diubah UP3.';
  END IF;
  IF btrim(COALESCE(p_ulp, '')) = '' THEN RAISE EXCEPTION 'ULP kosong.'; END IF;

  INSERT INTO public.perabasan_pengaturan (ulp, pohon_wajib, updated_at, updated_oleh)
  VALUES (upper(btrim(p_ulp)), p_pohon_wajib, now(), p_oleh)
  ON CONFLICT (ulp) DO UPDATE SET
    pohon_wajib = EXCLUDED.pohon_wajib, updated_at = now(), updated_oleh = EXCLUDED.updated_oleh;
END $fn$;
GRANT EXECUTE ON FUNCTION public.simpan_perabasan_pengaturan(TEXT, BOOLEAN, TEXT) TO authenticated;


-- ── 2. Tiang kerja tiap pohon ───────────────────────────────────────────────
ALTER TABLE public.perabasan_realisasi
  ADD COLUMN IF NOT EXISTS tiang_kerja_id UUID REFERENCES public.tiang(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS perabasan_realisasi_tiang_kerja_idx ON public.perabasan_realisasi (tiang_kerja_id);
COMMENT ON COLUMN public.perabasan_realisasi.tiang_kerja_id IS
  'Tiang segmen WO tempat pohon ini dirabas (wajib sejak 24 Nov 2026; bawaan = tiang terdekat dari titik pohon). Beda dengan tiang_id = pohon dari daftar inspeksi.';

-- Pohon dari daftar inspeksi: tiang kerjanya tiang inspeksinya.
UPDATE public.perabasan_realisasi SET tiang_kerja_id = tiang_id
WHERE tiang_kerja_id IS NULL AND tiang_id IS NOT NULL;

-- Tiang segmen yang paling dekat dari satu titik (NULL bila tak ada yang berkoordinat).
CREATE OR REPLACE FUNCTION public.perabasan_tiang_terdekat(p_segmen_id UUID, p_lat NUMERIC, p_lng NUMERIC)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT t.id
  FROM public.segmen_tiang st
  JOIN public.tiang t ON t.id = st.tiang_id
  WHERE st.segmen_id = p_segmen_id
    AND p_lat IS NOT NULL AND p_lng IS NOT NULL
    AND t.lat IS NOT NULL AND t.lng IS NOT NULL
  ORDER BY power(t.lat - p_lat, 2) + power((t.lng - p_lng) * cos(radians(p_lat)), 2)
  LIMIT 1;
$fn$;
GRANT EXECUTE ON FUNCTION public.perabasan_tiang_terdekat(UUID, NUMERIC, NUMERIC) TO authenticated;

-- Pohon lama temuan lapangan / hasil pengecekan: dicarikan dari titiknya.
UPDATE public.perabasan_realisasi r
SET tiang_kerja_id = public.perabasan_tiang_terdekat(i.segmen_id, r.lat, r.lng)
FROM public.wo_perabasan_item i
WHERE i.id = r.item_id AND r.tiang_kerja_id IS NULL AND r.lat IS NOT NULL;


-- ── 3. simpan_pohon_perabasan: tiang kerja wajib, di segmen ini ─────────────
-- Disalin dari perabasan-temuan-row.sql; perubahan ditandai ★★.
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
  v_alasan TEXT;
  v_tk     UUID;      -- ★★ tiang kerja
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

    -- Tidak perlu dirabas: hanya pohon dari daftar inspeksi, alasan + foto kondisi sekarang.
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
    DELETE FROM public.perabasan_tidak_dirabas WHERE id = (r->>'id')::uuid AND item_id = p_item_id;

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

    -- ★★ Tiang kerja: pilihan regu (hanya bila memang tiang segmen ini) →
    --    tiang inspeksinya → tiang terdekat dari titik pohon.
    --    TIDAK menolak kiriman: satu pohon bermasalah menggagalkan SELURUH
    --    paket (termasuk Selesai disisir) dan regu yang sedang bekerja —
    --    draf lama tanpa titik, peta HP yang basi sesudah segmen dikoreksi —
    --    akan tertahan. Penjaga "harus bertiang" & jarak ada di formulir HP;
    --    server memastikan tiang yang tersimpan selalu tiang segmen ini.
    v_tk := NULLIF(r->>'tiang_kerja_id', '')::uuid;
    IF v_tk IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.segmen_tiang WHERE segmen_id = it.segmen_id AND tiang_id = v_tk) THEN
      v_tk := NULL;
    END IF;
    v_tk := COALESCE(
      v_tk,
      NULLIF(r->>'tiang_id', '')::uuid,
      public.perabasan_tiang_terdekat(it.segmen_id, NULLIF(r->>'lat', '')::numeric, NULLIF(r->>'lng', '')::numeric)
    );

    INSERT INTO public.perabasan_realisasi AS pr (
      id, item_id, tiang_id, jenis_pohon, lat, lng,
      foto_sebelum_url, foto_sesudah_url, petugas_nama, petugas_uid, dikerjakan_at, catatan,
      cek_pohon_id, tiang_kerja_id
    ) VALUES (
      (r->>'id')::uuid, p_item_id, NULLIF(r->>'tiang_id', '')::uuid,
      NULLIF(btrim(r->>'jenis_pohon'), ''),
      NULLIF(r->>'lat', '')::numeric, NULLIF(r->>'lng', '')::numeric,
      r->>'foto_sebelum_url', r->>'foto_sesudah_url',
      p_petugas, auth.uid(),
      LEAST(COALESCE(NULLIF(r->>'dikerjakan_at', '')::timestamptz, now()), now()),
      NULLIF(btrim(r->>'catatan'), ''),
      v_cek, v_tk
    )
    ON CONFLICT (id) DO UPDATE SET
      tiang_id = EXCLUDED.tiang_id,
      jenis_pohon = EXCLUDED.jenis_pohon,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      foto_sebelum_url = EXCLUDED.foto_sebelum_url,
      foto_sesudah_url = EXCLUDED.foto_sesudah_url,
      catatan = EXCLUDED.catatan,
      cek_pohon_id = EXCLUDED.cek_pohon_id,
      tiang_kerja_id = EXCLUDED.tiang_kerja_id
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


-- ── 4. selesaikan_perabasan_segmen: pohon temuan wajib hanya bila diatur ────
-- Disalin dari perabasan-temuan-row.sql; perubahan ditandai ★★.
CREATE OR REPLACE FUNCTION public.selesaikan_perabasan_segmen(p_item_id uuid, p_catatan text DEFAULT NULL::text, p_petugas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n     INT;
  sisa  INT;
  v_ulp TEXT;   -- ★★
BEGIN
  SELECT count(*) INTO n FROM public.perabasan_realisasi WHERE item_id = p_item_id;

  SELECT count(*) INTO sisa
  FROM public.perabasan_cek_pohon c
  WHERE c.item_id = p_item_id
    AND NOT EXISTS (SELECT 1 FROM public.perabasan_realisasi x WHERE x.cek_pohon_id = c.id);
  IF sisa > 0 THEN
    RAISE EXCEPTION 'Masih ada % pohon hasil pengecekan yang belum dirabas di segmen ini. Rabas dan kirim semuanya dulu.', sisa;
  END IF;

  -- ★★ Pohon temuan inspeksi JTM wajib dirabas HANYA bila ULP-nya mengatur
  --    begitu (keputusan user 24 Nov 2026; bawaan tidak wajib).
  SELECT ulp INTO v_ulp FROM public.wo_perabasan_item WHERE id = p_item_id;
  IF public.perabasan_pohon_wajib(v_ulp) THEN
    sisa := public.perabasan_pohon_wajib_sisa(p_item_id);
    IF sisa > 0 THEN
      RAISE EXCEPTION 'Masih ada % pohon temuan inspeksi JTM yang belum dirabas di segmen ini. Rabas, atau tandai "tidak perlu dirabas", lalu kirim semuanya dulu.', sisa;
    END IF;
  END IF;

  n := n + (SELECT count(*) FROM public.perabasan_tidak_dirabas WHERE item_id = p_item_id);
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
