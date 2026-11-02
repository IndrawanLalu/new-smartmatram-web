-- =============================================================================
-- Tanggal kerja perabasan memakai tanggal WITA, bukan tanggal server UTC
-- (3 Nov 2026). Jalankan manual di Supabase SQL Editor. Idempoten.
--
-- Server berjalan di UTC: `CURRENT_DATE` sebelum pukul 08.00 WITA masih
-- tanggal kemarin. Kasus: GH GOMONG - LBS MTRZD PENGADILAN dimulai 1 Okt
-- 06.09 WITA tercatat 30 Sep → realisasi lari ke September. Sejak realisasi
-- perabasan dihitung di bulan MULAI dirabas, selisih sehari di awal bulan
-- memindahkan km ke bulan lain.
--
-- Isi: tiga fungsi yang menulis tgl_mulai / tgl_selesai, disalin utuh dari
-- definisi terakhir (wo-perabasan.sql, perabasan-cek.sql); yang berubah hanya
-- CURRENT_DATE → (now() AT TIME ZONE 'Asia/Makassar')::date.
-- ⚠ Definisi terbaru ketiganya kini di SINI.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mulai_perabasan_segmen(
  p_item_id UUID,
  p_petugas TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE public.wo_perabasan_item
  SET status = 'Dalam Proses',
      tgl_mulai = COALESCE(tgl_mulai, (now() AT TIME ZONE 'Asia/Makassar')::date),
      petugas_nama = COALESCE(p_petugas, petugas_nama),
      petugas_uid = COALESCE(auth.uid(), petugas_uid),
      updated_at = now()
  WHERE id = p_item_id AND status IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Segmen ini tidak bisa dimulai — mungkin sudah dilaporkan selesai atau sudah diverifikasi.';
  END IF;
END $fn$;

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
      tgl_mulai = COALESCE(tgl_mulai, (now() AT TIME ZONE 'Asia/Makassar')::date),
      petugas_nama = COALESCE(p_petugas, petugas_nama),
      petugas_uid = COALESCE(auth.uid(), petugas_uid),
      updated_at = now()
  WHERE id = p_item_id;

  RETURN n;
END $function$;

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
