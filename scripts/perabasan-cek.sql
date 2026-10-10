-- =============================================================================
-- Cek Perabasan dari HP — C1 (10 Okt 2026). Rencana: rencana-cek-perabasan.md
--
-- Segmen yang dinyatakan "Selesai disisir" oleh regu dicek pengecek di lapangan
-- (admin ULP, peran ber-izin verifikasi WO, UP3). Pohon yang belum dirabas
-- dititik → POHON HASIL PENGECEKAN milik segmen itu, segmen dikembalikan ke
-- regu, dan regu WAJIB merabas semuanya sebelum boleh Selesai disisir lagi.
--
-- Tiga macam pohon di satu segmen:
--   pohon inspeksi           view perabasan_pohon (vegetasi inspeksi JTM)
--   pohon perabasan          perabasan_realisasi (yang dirabas regu)
--   pohon hasil pengecekan   perabasan_cek_pohon (BARU) — dirabas bila ada
--                            perabasan_realisasi.cek_pohon_id yang menunjuknya
--
-- Isi berkas:
--   1. wajib_boleh_cek_perabasan(ulp)        — hak pengecek
--   2. wo_perabasan_item.cek_ke               — putaran cek
--   3. tabel perabasan_cek_pohon + view perabasan_cek_pohon_status
--   4. perabasan_realisasi.cek_pohon_id
--   5. kirim_cek_perabasan                    — HP pengecek, satu transaksi
--   6. simpan_pohon_perabasan  (+cek_pohon_id)
--   7. selesaikan_perabasan_segmen (kunci pohon hasil pengecekan)
--   8. putuskan_perabasan_segmen (web: hak pengecek + putaran)
-- =============================================================================


-- ── 1. Hak pengecek ──────────────────────────────────────────────────────────
-- UP3 semua ULP; admin ULP itu; peran ber-izin verifikasi WO (Kelola Role,
-- roles.can_verify_wo — Staff Teknik, TL Teknik, Koordinator) ULP itu.

CREATE OR REPLACE FUNCTION public.wajib_boleh_cek_perabasan(p_ulp TEXT)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role  TEXT;
  v_unit  TEXT;
  v_cek   BOOLEAN;
BEGIN
  SELECT ur.role, ur.unit, COALESCE(r.can_verify_wo, false)
    INTO v_role, v_unit, v_cek
  FROM public.user_roles ur
  LEFT JOIN public.roles r ON r.code = ur.role
  WHERE ur.user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak dikenali server. Keluar lalu masuk lagi, kemudian kirim ulang — isian tetap tersimpan di HP.';
  END IF;
  IF v_role = 'UP3' THEN RETURN; END IF;
  IF (v_role = 'admin' OR v_cek) AND upper(COALESCE(v_unit, '')) = upper(COALESCE(p_ulp, '')) THEN RETURN; END IF;

  RAISE EXCEPTION
    'Anda tidak berhak mengecek perabasan ULP %. Yang boleh: UP3, admin ULP itu, dan peran ber-izin verifikasi WO di ULP itu.',
    COALESCE(p_ulp, '-');
END $$;

REVOKE ALL ON FUNCTION public.wajib_boleh_cek_perabasan(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wajib_boleh_cek_perabasan(TEXT) TO authenticated;


-- ── 2. Putaran cek per item ──────────────────────────────────────────────────
-- Naik tiap keputusan (HP atau web). Pohon hasil pengecekan mencatat putaran
-- yang melahirkannya — "dikembalikan dua kali" terbaca dari datanya.

ALTER TABLE public.wo_perabasan_item ADD COLUMN IF NOT EXISTS cek_ke INT NOT NULL DEFAULT 0;


-- ── 3. Pohon hasil pengecekan ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.perabasan_cek_pohon (
  -- Id dari HP: kirim ulang setelah sinyal putus tidak menggandakan pohon.
  id          UUID PRIMARY KEY,
  item_id     UUID NOT NULL REFERENCES public.wo_perabasan_item(id) ON DELETE CASCADE,
  segmen_id   UUID,
  ulp         TEXT NOT NULL,
  putaran     INT  NOT NULL,
  lat         NUMERIC(10,7) NOT NULL,
  lng         NUMERIC(10,7) NOT NULL,
  jenis_pohon TEXT NOT NULL,
  -- Foto sampai 3; kolom pertama = foto UTAMA (teknisaplikasi butir 22).
  foto_url    TEXT NOT NULL,
  foto_url_2  TEXT,
  foto_url_3  TEXT,
  catatan     TEXT,
  dicek_oleh  TEXT,
  dicek_uid   UUID,
  dicek_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS perabasan_cek_pohon_item_idx   ON public.perabasan_cek_pohon (item_id);
CREATE INDEX IF NOT EXISTS perabasan_cek_pohon_segmen_idx ON public.perabasan_cek_pohon (segmen_id);

COMMENT ON TABLE public.perabasan_cek_pohon IS
  'Pohon hasil pengecekan: pohon yang belum dirabas, dititik pengecek saat mengecek segmen yang dinyatakan selesai. Dirabas = ada perabasan_realisasi.cek_pohon_id yang menunjuknya.';

ALTER TABLE public.perabasan_cek_pohon ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perabasan_cek_pohon_baca ON public.perabasan_cek_pohon;
CREATE POLICY perabasan_cek_pohon_baca ON public.perabasan_cek_pohon FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.perabasan_cek_pohon TO authenticated;
-- Penulisan HANYA lewat kirim_cek_perabasan.


-- ── 4. Pohon perabasan yang menjawab pohon hasil pengecekan ──────────────────

ALTER TABLE public.perabasan_realisasi
  ADD COLUMN IF NOT EXISTS cek_pohon_id UUID REFERENCES public.perabasan_cek_pohon(id) ON DELETE SET NULL;

-- Satu pohon hasil pengecekan dijawab SATU pohon perabasan.
CREATE UNIQUE INDEX IF NOT EXISTS perabasan_realisasi_cek_unik
  ON public.perabasan_realisasi (cek_pohon_id) WHERE cek_pohon_id IS NOT NULL;

CREATE OR REPLACE VIEW public.perabasan_cek_pohon_status AS
SELECT c.*,
       r.id IS NOT NULL      AS dirabas,
       r.id                  AS realisasi_id,
       r.foto_sebelum_url    AS rabas_foto_sebelum_url,
       r.foto_sesudah_url    AS rabas_foto_sesudah_url,
       r.dikerjakan_at       AS dirabas_at,
       r.petugas_nama        AS dirabas_oleh
FROM public.perabasan_cek_pohon c
LEFT JOIN public.perabasan_realisasi r ON r.cek_pohon_id = c.id;

COMMENT ON VIEW public.perabasan_cek_pohon_status IS
  'Pohon hasil pengecekan + apakah sudah dirabas regu (dan fotonya).';

GRANT SELECT ON public.perabasan_cek_pohon_status TO authenticated;


-- ── 5. Kirim hasil cek dari HP ───────────────────────────────────────────────
-- p_pohon kosong  → segmen DITERIMA (Diverifikasi).
-- p_pohon berisi  → pohon disimpan, segmen DIKEMBALIKAN (Ditolak) dengan alasan
--                   "N pohon belum dirabas (hasil pengecekan)" + catatan.
-- Satu transaksi. Kirim ulang setelah sinyal putus (keputusan sudah tercatat)
-- dijawab "sudah tercatat", bukan galat.

CREATE OR REPLACE FUNCTION public.kirim_cek_perabasan(
  p_item_id UUID,
  p_pohon   JSONB,
  p_catatan TEXT DEFAULT NULL,
  p_oleh    TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it      RECORD;
  r       JSONB;
  n       INT := COALESCE(jsonb_array_length(COALESCE(p_pohon, '[]'::jsonb)), 0);
  ada     INT;
  terima  BOOLEAN;
  catat   TEXT := NULLIF(btrim(COALESCE(p_catatan, '')), '');
  alasan  TEXT;
  putaran INT;
BEGIN
  SELECT * INTO it FROM public.wo_perabasan_item WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Segmen WO tidak ditemukan.'; END IF;
  PERFORM public.wajib_boleh_cek_perabasan(it.ulp);
  terima := n = 0;

  IF it.status <> 'Selesai' THEN
    -- Kiriman ulang dari HP yang jawabannya hilang di jalan.
    SELECT count(*) INTO ada FROM public.perabasan_cek_pohon c
     WHERE c.item_id = p_item_id
       AND c.id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(COALESCE(p_pohon, '[]'::jsonb)) x
                     WHERE NULLIF(x->>'id', '') IS NOT NULL);
    IF (terima AND it.status = 'Diverifikasi') OR (NOT terima AND ada = n) THEN
      RETURN jsonb_build_object('status', it.status, 'pohon', n, 'ulang', true);
    END IF;
    RAISE EXCEPTION 'Segmen % sudah tidak menunggu dicek (status %). Muat ulang daftar.', it.segmen_nama, it.status;
  END IF;

  putaran := it.cek_ke + 1;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_pohon, '[]'::jsonb)) LOOP
    IF NULLIF(r->>'id', '') IS NULL THEN
      RAISE EXCEPTION 'Pohon tanpa id — perbarui aplikasi lalu kirim ulang.';
    END IF;
    IF NULLIF(r->>'lat', '') IS NULL OR NULLIF(r->>'lng', '') IS NULL THEN
      RAISE EXCEPTION 'Ada pohon tanpa titik GPS. Titik ulang pohonnya.';
    END IF;
    IF NULLIF(btrim(r->>'jenis_pohon'), '') IS NULL THEN
      RAISE EXCEPTION 'Jenis pohon wajib diisi untuk tiap pohon.';
    END IF;
    IF COALESCE(r->>'foto_url', '') NOT LIKE 'http%'
       OR (NULLIF(r->>'foto_url_2', '') IS NOT NULL AND r->>'foto_url_2' NOT LIKE 'http%')
       OR (NULLIF(r->>'foto_url_3', '') IS NOT NULL AND r->>'foto_url_3' NOT LIKE 'http%') THEN
      RAISE EXCEPTION 'Foto pohon belum terunggah. Kirim ulang saat sinyal lebih baik.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.perabasan_cek_pohon c WHERE c.id = (r->>'id')::uuid AND c.item_id <> p_item_id) THEN
      RAISE EXCEPTION 'Id pohon bentrok dengan segmen lain — perbarui aplikasi lalu kirim ulang.';
    END IF;

    INSERT INTO public.perabasan_cek_pohon (
      id, item_id, segmen_id, ulp, putaran, lat, lng, jenis_pohon,
      foto_url, foto_url_2, foto_url_3, catatan, dicek_oleh, dicek_uid, dicek_at
    ) VALUES (
      (r->>'id')::uuid, p_item_id, it.segmen_id, it.ulp, putaran,
      (r->>'lat')::numeric, (r->>'lng')::numeric, btrim(r->>'jenis_pohon'),
      r->>'foto_url', NULLIF(r->>'foto_url_2', ''), NULLIF(r->>'foto_url_3', ''),
      NULLIF(btrim(r->>'catatan'), ''), p_oleh, auth.uid(),
      LEAST(COALESCE(NULLIF(r->>'dicek_at', '')::timestamptz, now()), now())
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  alasan := CASE WHEN terima THEN catat
                 ELSE concat_ws(' — ', format('%s pohon belum dirabas (hasil pengecekan)', n), catat) END;

  UPDATE public.wo_perabasan_item
  SET status = CASE WHEN terima THEN 'Diverifikasi' ELSE 'Ditolak' END,
      cek_ke = putaran,
      verified_at = now(),
      verified_by = auth.uid(),
      verified_note = alasan,
      updated_at = now()
  WHERE id = p_item_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_perabasan_item', it.segmen_nama, it.ulp,
          CASE WHEN terima THEN 'diverifikasi' ELSE 'ditolak' END,
          to_jsonb(it.status),
          jsonb_build_object('status', CASE WHEN terima THEN 'Diverifikasi' ELSE 'Ditolak' END,
                             'panjang_km', it.panjang_km, 'catatan', alasan,
                             'pohon_cek', n, 'putaran', putaran, 'lewat', 'hp'),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('status', CASE WHEN terima THEN 'Diverifikasi' ELSE 'Ditolak' END,
                            'pohon', n, 'putaran', putaran, 'ulang', false);
END $$;

REVOKE ALL ON FUNCTION public.kirim_cek_perabasan(UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kirim_cek_perabasan(UUID, JSONB, TEXT, TEXT) TO authenticated;


-- ── 6. simpan_pohon_perabasan + cek_pohon_id ─────────────────────────────────
-- Disalin dari definisi hidup (perabasan-kerja-hp.sql); ★ = perubahan.

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
  v_cek  UUID;   -- ★
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
    IF COALESCE(r->>'foto_sebelum_url', '') NOT LIKE 'http%' OR COALESCE(r->>'foto_sesudah_url', '') NOT LIKE 'http%' THEN
      RAISE EXCEPTION 'Foto pohon belum terunggah. Kirim ulang saat sinyal lebih baik.';
    END IF;

    -- ★ Pohon hasil pengecekan yang dijawab pohon ini: harus milik segmen ini,
    --   dan belum dijawab pohon lain.
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
      cek_pohon_id                                                                -- ★
    ) VALUES (
      (r->>'id')::uuid, p_item_id, NULLIF(r->>'tiang_id', '')::uuid,
      NULLIF(btrim(r->>'jenis_pohon'), ''),
      NULLIF(r->>'lat', '')::numeric, NULLIF(r->>'lng', '')::numeric,
      r->>'foto_sebelum_url', r->>'foto_sesudah_url',
      p_petugas, auth.uid(),
      LEAST(COALESCE(NULLIF(r->>'dikerjakan_at', '')::timestamptz, now()), now()),
      NULLIF(btrim(r->>'catatan'), ''),
      v_cek                                                                       -- ★
    )
    ON CONFLICT (id) DO UPDATE SET
      tiang_id = EXCLUDED.tiang_id,
      jenis_pohon = EXCLUDED.jenis_pohon,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      foto_sebelum_url = EXCLUDED.foto_sebelum_url,
      foto_sesudah_url = EXCLUDED.foto_sesudah_url,
      catatan = EXCLUDED.catatan,
      cek_pohon_id = EXCLUDED.cek_pohon_id                                        -- ★
    -- Id milik segmen LAIN tidak boleh ditimpa lewat segmen ini.
    WHERE pr.item_id = p_item_id;
    n := n + 1;
  END LOOP;

  -- Pohon pertama terkirim = segmen sedang dikerjakan (kalau "Mulai" belum
  -- sempat terkirim karena tanpa sinyal).
  UPDATE public.wo_perabasan_item
  SET status = CASE WHEN status = 'Dijadwalkan' THEN 'Dalam Proses' ELSE status END,
      tgl_mulai = COALESCE(tgl_mulai, CURRENT_DATE),
      petugas_nama = COALESCE(p_petugas, petugas_nama),
      petugas_uid = COALESCE(auth.uid(), petugas_uid),
      updated_at = now()
  WHERE id = p_item_id;

  RETURN n;
END $function$;


-- ── 7. selesaikan_perabasan_segmen — pohon hasil pengecekan wajib dirabas ────
-- Disalin dari definisi hidup; ★ = perubahan.

CREATE OR REPLACE FUNCTION public.selesaikan_perabasan_segmen(p_item_id uuid, p_catatan text DEFAULT NULL::text, p_petugas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n     INT;
  sisa  INT;   -- ★
BEGIN
  SELECT count(*) INTO n FROM public.perabasan_realisasi WHERE item_id = p_item_id;

  -- ★ Keputusan user 10 Okt 2026: semua pohon hasil pengecekan WAJIB dirabas
  --   sebelum segmen boleh dinyatakan selesai lagi.
  SELECT count(*) INTO sisa
  FROM public.perabasan_cek_pohon c
  WHERE c.item_id = p_item_id
    AND NOT EXISTS (SELECT 1 FROM public.perabasan_realisasi x WHERE x.cek_pohon_id = c.id);
  IF sisa > 0 THEN
    RAISE EXCEPTION 'Masih ada % pohon hasil pengecekan yang belum dirabas di segmen ini. Rabas dan kirim semuanya dulu.', sisa;
  END IF;

  -- Segmen boleh diselesaikan TANPA satu pohon pun, dan itu disengaja: ruas
  -- yang disisir dan ternyata bersih adalah hasil kerja yang sah. Yang tidak
  -- boleh adalah diam — karena itu catatannya diwajibkan kalau nol.
  IF n = 0 AND btrim(COALESCE(p_catatan, '')) = '' THEN
    RAISE EXCEPTION
      'Tidak ada satu pohon pun yang dilaporkan di segmen ini. Kalau ruasnya memang bersih, tuliskan itu di catatan — laporan kosong tanpa keterangan tidak bisa dibedakan dari pekerjaan yang belum dikerjakan.';
  END IF;

  UPDATE public.wo_perabasan_item
  SET status = 'Selesai',
      tgl_selesai = CURRENT_DATE,
      tgl_mulai = COALESCE(tgl_mulai, CURRENT_DATE),
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


-- ── 8. putuskan_perabasan_segmen (web) — hak pengecek + putaran ──────────────
-- Disalin dari definisi hidup; ★ = perubahan.

CREATE OR REPLACE FUNCTION public.putuskan_perabasan_segmen(p_item_id uuid, p_terima boolean, p_catatan text DEFAULT NULL::text, p_oleh text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  it RECORD;
BEGIN
  SELECT * INTO it FROM public.wo_perabasan_item WHERE id = p_item_id FOR UPDATE;   -- ★ FOR UPDATE
  IF NOT FOUND THEN RAISE EXCEPTION 'Item WO tidak ditemukan'; END IF;

  PERFORM public.wajib_boleh_cek_perabasan(it.ulp);   -- ★ dulu wajib_boleh_ulp (UP3 + admin)

  IF it.status <> 'Selesai' THEN
    RAISE EXCEPTION 'Hanya segmen berstatus Selesai yang bisa diputuskan. Yang ini berstatus %.', it.status;
  END IF;

  -- Penolakan HARUS beralasan. Regu yang dikembalikan tanpa keterangan cuma
  -- bisa menebak apa yang kurang, dan tebakan itu dikerjakan ulang dengan
  -- kekurangan yang sama.
  IF NOT p_terima AND btrim(COALESCE(p_catatan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi.';
  END IF;

  UPDATE public.wo_perabasan_item
  SET status = CASE WHEN p_terima THEN 'Diverifikasi' ELSE 'Ditolak' END,
      cek_ke = cek_ke + 1,                                                         -- ★
      verified_at = now(),
      verified_by = auth.uid(),
      verified_note = NULLIF(btrim(COALESCE(p_catatan, '')), ''),
      updated_at = now()
  WHERE id = p_item_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_perabasan_item', it.segmen_nama, it.ulp,
          CASE WHEN p_terima THEN 'diverifikasi' ELSE 'ditolak' END,
          to_jsonb(it.status),
          jsonb_build_object('status', CASE WHEN p_terima THEN 'Diverifikasi' ELSE 'Ditolak' END,
                             'panjang_km', it.panjang_km, 'catatan', p_catatan),
          'sunting_admin', auth.uid(), p_oleh);
END $function$;


-- ── Periksa ──────────────────────────────────────────────────────────────────
-- SELECT status, count(*) FROM wo_perabasan_item GROUP BY 1;   -- Selesai = menunggu dicek
-- SELECT * FROM perabasan_cek_pohon_status ORDER BY dicek_at DESC LIMIT 20;
