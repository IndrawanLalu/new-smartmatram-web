-- =============================================================================
-- Pecah segmen: tiang PANGKAL ikut dihitung (28 Okt 2026)
-- Jalankan SESUDAH jtm-pecah-arah.sql. Idempoten.
--
-- Kasus: KARANG UJUNG, section "REC. BLONGAS - REC. PELEMBAK/LBSM. KOBON ROEK",
-- segmen rintisan "REC. BLONGAS - LBSM KEBON ROEK" (pangkal REC. BLONGAS
-- KJG-101R028). Dari REC. BLONGAS jaringannya langsung bercabang dua: ke
-- KJG-101R028L001… (LBSM KOBON ROEK) dan ke KJG-101R029… (REC. PELEMBAK).
--
-- Segmen hasil rintis TIDAK memuat tiang pangkalnya di segmen_tiang (tiang itu
-- milik segmen sebelumnya). _segmen_simpul hanya membaca anggota, jadi segmen
-- ini punya DUA pangkal (L001 dan R029) dan percabangannya (R028) tidak
-- terlihat: Pecah menolak "pangkal segmen — tidak bisa jadi titik potong" dan
-- pilihan "potong ke arah mana" tidak muncul.
--
-- Perbaikan: untuk SATU segmen (pratinjau / pecah), tiang pangkalnya
-- (segmen.titik_awal_tiang_id) ikut dimasukkan ke _sg_simpul sebagai akar bila
-- belum jadi anggota. Pecah menyalin keanggotaan dari segmen_tiang yang ada,
-- jadi tiang pangkal itu TIDAK ikut ditulis sebagai anggota — ia hanya pangkal
-- (titik_awal) potongan arahnya, sama dengan cara rintis. Gabung (dua segmen)
-- tidak berubah.
--
-- Ditambal pada definisi HIDUP (pg_get_functiondef + penanda) — berhenti bila
-- penandanya tidak ketemu.
-- =============================================================================

DO $tambal$
DECLARE
  def  TEXT;
  baru TEXT;
  penanda TEXT := E'  -- Induk langsung (tanpa melompati celah) — dipakai menilai bersebelahan.\n';
BEGIN
  SELECT replace(pg_get_functiondef('public._segmen_simpul(uuid[])'::regprocedure), E'\r\n', E'\n') INTO def;
  IF position('jtm-pecah-pangkal.sql' IN def) > 0 THEN
    RAISE NOTICE '_segmen_simpul sudah bertambalan pangkal — dilewati.';
    RETURN;
  END IF;
  IF (length(def) - length(replace(def, penanda, ''))) / length(penanda) <> 1 THEN
    RAISE EXCEPTION 'Tambalan _segmen_simpul: penanda tidak ditemukan tepat sekali — skrip dihentikan, tidak ada yang berubah.';
  END IF;
  baru := replace(def, penanda,
       E'  -- ★ Pangkal segmen tunggal (jtm-pecah-pangkal.sql): segmen rintisan tidak memuat\n'
    || E'  -- tiang pangkalnya. Dimasukkan sebagai akar supaya percabangan tepat di\n'
    || E'  -- pangkal terlihat (potong per arah). Tidak ditulis sebagai anggota.\n'
    || E'  IF cardinality(p_segmen) = 1 THEN\n'
    || E'    INSERT INTO _sg_simpul (id, induk, lat, lng, kode, penanda, nama_alat)\n'
    || E'    SELECT t.id, NULL, t.lat, t.lng, COALESCE(kp.kode, t.kode), lower(t.penanda), NULLIF(btrim(t.nama_peralatan), '''')\n'
    || E'    FROM public.segmen s\n'
    || E'    JOIN public.tiang t ON t.id = s.titik_awal_tiang_id AND t.status_hidup = ''aktif''\n'
    || E'    LEFT JOIN public.tiang_kode_penyulang kp ON kp.tiang_id = t.id AND upper(kp.penyulang) = v_p AND upper(kp.ulp) = v_u\n'
    || E'    WHERE s.id = p_segmen[1]\n'
    || E'    ON CONFLICT (id) DO NOTHING;\n'
    || E'  END IF;\n\n'
    || penanda);
  EXECUTE baru;
  RAISE NOTICE '_segmen_simpul ditambal (pangkal segmen tunggal).';
END $tambal$;

-- ── Periksa (KARANG UJUNG) ────────────────────────────────────────────────────
--   SELECT jsonb_pretty(pecah_segmen('3b111fdc-7084-4f7d-b6cb-865a44b41247', ARRAY[]::uuid[], '{}', NULL, true, NULL) -> 'percabangan');
--   -- harus memuat KJG-101R028 dengan dua arah: KJG-101R028L001 dan KJG-101R029
