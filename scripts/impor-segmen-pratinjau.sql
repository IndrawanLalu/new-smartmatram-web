-- =============================================================================
-- Impor segmen: pratinjau sebelum benar-benar dibuat
-- Jalankan SESUDAH `master-segmen.sql`. Idempoten.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
-- Bapak 21 Sep: "IMPORT segmentnya membingungkan, formatnya tidak begitu jelas
-- cara user paste segment barunya."
--
-- Duduk perkaranya bukan pada kolomnya, melainkan pada apa yang TIDAK terlihat:
-- nama segmen disusun sistem dari kedua ujungnya, dan admin tidak punya cara
-- melihat hasilnya sebelum menekan Impor. Dia menempel "GI AMPENAN" dan
-- "REC BRIMOB", lalu menebak apakah yang terbentuk "GI AMPENAN - REC. BRIMOB"
-- atau sesuatu yang lain — dan baru tahu sesudah barisnya telanjur ada.
--
-- ── KENAPA DIKERJAKAN DI SINI, BUKAN DI LAYAR ───────────────────────────────
-- Layar bisa saja meniru `pisah_label_titik` dan `segmen_label_titik` dalam
-- TypeScript. Tapi tiruan itu akan melenceng cepat atau lambat — dan yang
-- melenceng di sini berarti pratinjau menjanjikan nama yang berbeda dari yang
-- benar-benar dibuat. Satu fungsi, satu jawaban.
--
-- Caranya: `impor_segmen` dapat parameter `p_uji`. Kalau true, seluruh
-- pemeriksaan dijalankan apa adanya — pemisahan label, penamaan, penolakan
-- duplikat, penolakan panjang tak wajar — tapi tidak satu baris pun ditulis.
-- =============================================================================

DROP FUNCTION IF EXISTS public.impor_segmen(TEXT, JSONB, TEXT);

CREATE OR REPLACE FUNCTION public.impor_segmen(
  p_penyulang TEXT,
  p_baris     JSONB,
  p_oleh      TEXT    DEFAULT NULL,
  p_uji       BOOLEAN DEFAULT false
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
  siap     JSONB := '[]'::jsonb;
  dilewati JSONB := '[]'::jsonb;
  -- Nama yang akan lahir dalam tempelan INI. Tanpa ini, dua baris kembar di
  -- dalam satu tempelan lolos berdua — yang kedua tidak ketahuan karena yang
  -- pertama belum tersimpan (apalagi saat p_uji, yang memang tidak menyimpan).
  sudah    TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT ulp INTO unit FROM public.penyulang_ref WHERE upper(penyulang) = nama_p;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Penyulang "%" belum ada di Master Penyulang. Daftarkan dulu di sana — segmen tanpa induk yang sah tidak bisa dipakai jadi WO.', nama_p;
  END IF;
  IF COALESCE(unit, '') = '' THEN
    RAISE EXCEPTION 'Penyulang "%" belum punya ULP di master. Lengkapi dulu.', nama_p;
  END IF;

  -- Pratinjau tidak mengubah apa pun, jadi tidak perlu hak mengubah. Yang
  -- memakainya justru admin yang sedang memastikan dia BOLEH — dan menolaknya
  -- di sini membuat dia menebak-nebak di tempat yang paling tidak perlu.
  IF NOT p_uji THEN
    PERFORM public.wajib_boleh_ulp(unit);
  END IF;

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

    IF label = ANY(sudah) THEN
      dilewati := dilewati || jsonb_build_object(
        'baris', b, 'sebab', format('Kembar dengan baris lain di tempelan ini — "%s".', label));
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM public.segmen
               WHERE upper(penyulang) = nama_p AND nama = label) THEN
      IF NOT p_uji AND km IS NOT NULL THEN
        UPDATE public.segmen
        SET panjang_manual_km = km, updated_at = now()
        WHERE upper(penyulang) = nama_p AND nama = label
          AND sumber <> 'lapangan' AND panjang_manual_km IS NULL;
      END IF;
      dilewati := dilewati || jsonb_build_object(
        'baris', b, 'sebab', format('Segmen "%s" sudah ada — tidak ditimpa.', label));
      CONTINUE;
    END IF;

    sudah  := sudah || label;
    dibuat := dibuat + 1;

    -- Inilah yang membuat pratinjaunya berguna: nama yang AKAN terbentuk,
    -- bukan sekadar cacah barisnya.
    siap := siap || jsonb_build_object(
      'nama', label, 'km', km,
      'awal_jenis', ta.jenis, 'akhir_jenis', tb.jenis);

    IF NOT p_uji THEN
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
    END IF;
  END LOOP;

  IF NOT p_uji THEN
    INSERT INTO public.master_audit
      (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
    VALUES ('segmen', nama_p, unit, 'impor', NULL,
            jsonb_build_object('dibuat', dibuat, 'dilewati', jsonb_array_length(dilewati)),
            'sunting_admin', auth.uid(), p_oleh);
  END IF;

  RETURN jsonb_build_object(
    'penyulang', nama_p, 'ulp', unit,
    'uji', p_uji,
    'dibuat', dibuat,
    'siap', siap,
    'dilewati', dilewati);
END $fn$;

GRANT EXECUTE ON FUNCTION public.impor_segmen TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Pratinjau — TIDAK menulis apa pun, aman dicoba berkali-kali:
--      SELECT jsonb_pretty(impor_segmen('GUNUNG SARI', '[
--        {"awal":"GI AMPENAN","akhir":"REC BRIMOB","km":2.03},
--        {"awal":"rec. brimob","akhir":"LBS PASAR","km":3.4},
--        {"awal":"LBS PASAR","akhir":"UJUNG"}
--      ]'::jsonb, 'uji', true));
--
--    Perhatikan: "REC BRIMOB" dan "rec. brimob" sama-sama jadi "REC. BRIMOB",
--    jadi baris kedua akan disebut kembar dengan yang pertama.
--
-- b. Baru laksanakan, dengan p_uji dibiarkan false:
--      SELECT jsonb_pretty(impor_segmen('GUNUNG SARI', '[...]'::jsonb, 'uji'));
-- =============================================================================
