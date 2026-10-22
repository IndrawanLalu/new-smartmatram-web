-- =============================================================================
-- Nama dobel saat "Ganti nama (hilir ikut)" JTM (22 Okt 2026).
-- Jalankan SESUDAH jtm-induk-per-penyulang.sql. Idempoten.
--
-- Dulu: nama baru yang sudah dipakai tiang di luar bagian yang diganti =
-- bentrok, Terapkan diblokir. Sekarang (keputusan user 22 Okt):
--   • yang LEBIH DEKAT KE PANGKAL menang;
--   • tiang luar yang lebih ke ujung KALAH → ia + hilirnya diberi nama ulang
--     menurut aturan dari induknya, tampil di pratinjau ("nama dobel — …");
--   • tiang luar yang lebih dekat pangkal (atau sama jauh) → tetap bentrok.
-- terapkan_nama_jtm tidak berubah: ia menerapkan seluruh baris pratinjau
-- (nama sementara dulu, jadi tukar nama aman).
--
-- susun_nama_jtm disalin dari jtm-induk-per-penyulang.sql; badan penelusuran
-- dipindah utuh ke _jtm_sn_jalan; yang baru ditandai ★.
-- =============================================================================

-- ★ Penelusuran nama satu bagian pohon — badan perulangan `susun_nama_jtm`
-- yang terpasang, dipindah apa adanya supaya bisa dipakai juga untuk tiang
-- yang KALAH saat nama dobel. Membaca _sn_simpul, menulis _sn_hasil (tabel
-- sementara milik pemanggil). Mengembalikan nomor `urut` terakhir.
CREATE OR REPLACE FUNCTION public._jtm_sn_jalan(p_akar UUID, p_nama TEXT, p_singkat TEXT, p_urut INT)
RETURNS INT
LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  n        UUID;
  k        TEXT;
  s_id     UUID[];
  s_kode   TEXT[];
  urut     INT := p_urut;
  m        RECORD;
  ch       RECORD;
  u_id     UUID;
  arah_u   DOUBLE PRECISION;
  h        RECORD;
  masuk    DOUBLE PRECISION;
  sisi     TEXT;
  anak_id  UUID[];
  anak_kd  TEXT[];
  jml_r    INT;
  jml_l    INT;
  awalan   TEXT;
  angka    INT;
BEGIN
  s_id := ARRAY[p_akar];
  s_kode := ARRAY[p_nama];

  WHILE cardinality(s_id) > 0 LOOP
    n := s_id[cardinality(s_id)];
    k := s_kode[cardinality(s_kode)];
    s_id := s_id[1:cardinality(s_id) - 1];
    s_kode := s_kode[1:cardinality(s_kode) - 1];
    SELECT * INTO m FROM _sn_simpul WHERE id = n;
    urut := urut + 1;
    INSERT INTO _sn_hasil VALUES (n, m.lama, k, m.induk, m.cabang, NULL, urut);

    -- Anak jalur utama: yang bukan cabang, tertua dulu. Anak bukan-cabang
    -- lainnya dianggap cabang (satu tiang, satu lanjutan utama).
    SELECT id INTO u_id FROM _sn_simpul WHERE induk = n AND NOT cabang ORDER BY dibuat, id LIMIT 1;

    -- Arah jalur utama yang keluar dari n (untuk sisi R/L cabang).
    arah_u := NULL;
    IF u_id IS NOT NULL THEN
      SELECT public.arah_derajat(m.lat, m.lng, x.lat, x.lng) INTO arah_u FROM _sn_simpul x WHERE x.id = u_id;
    ELSE
      SELECT lat, lng INTO h FROM _sn_simpul WHERE id = m.induk;
      masuk := public.arah_derajat(h.lat, h.lng, m.lat, m.lng);
      IF masuk IS NOT NULL THEN
        arah_u := (masuk + CASE m.arah_utama WHEN 'kanan' THEN 90 WHEN 'kiri' THEN 270 ELSE 0 END)::numeric % 360;
      END IF;
    END IF;

    -- Cabang: R sebelum L, lalu tertua. Disusun dulu, didorong ke tumpukan
    -- terbalik supaya keluar berurutan sesudah jalur utama.
    anak_id := '{}'; anak_kd := '{}'; jml_r := 0; jml_l := 0;
    FOR ch IN
      SELECT x.id, x.cabang, public._jtm_sisi(arah_u, public.arah_derajat(m.lat, m.lng, x.lat, x.lng)) AS sisi
      FROM _sn_simpul x
      WHERE x.induk = n AND x.id IS DISTINCT FROM u_id
      ORDER BY 3 DESC, x.dibuat, x.id     -- 'R' > 'L'
    LOOP
      IF ch.sisi = 'R' THEN jml_r := jml_r + 1; sisi := repeat('R', jml_r);
      ELSE jml_l := jml_l + 1; sisi := repeat('L', jml_l); END IF;
      anak_id := anak_id || ch.id;
      anak_kd := anak_kd || (k || sisi || '001');
      IF NOT ch.cabang THEN
        INSERT INTO _sn_hasil VALUES (ch.id, NULL, NULL, NULL, NULL,
          'dianggap cabang — ' || k || ' sudah punya lanjutan utama', -1);
      END IF;
    END LOOP;
    FOR i IN REVERSE cardinality(anak_id)..1 LOOP
      s_id := s_id || anak_id[i];
      s_kode := s_kode || anak_kd[i];
    END LOOP;

    IF u_id IS NOT NULL THEN
      awalan := regexp_replace(k, '[0-9]+[a-z]?$', '');
      angka  := COALESCE((regexp_match(k, '([0-9]+)[a-z]?$'))[1]::int, 0);
      s_id := s_id || u_id;
      s_kode := s_kode || (awalan || lpad((angka + 1)::text, 3, '0'));
    END IF;
  END LOOP;
  RETURN urut;
END $$;
REVOKE ALL ON FUNCTION public._jtm_sn_jalan(UUID, TEXT, TEXT, INT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.susun_nama_jtm(
  p_penyulang   TEXT,
  p_ulp         TEXT,
  p_mulai       UUID DEFAULT NULL,
  p_nama_mulai  TEXT DEFAULT NULL,
  p_utama_paksa UUID DEFAULT NULL
) RETURNS TABLE (tiang_id UUID, lama TEXT, baru TEXT, induk_id UUID, cabang BOOLEAN, catatan TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  singkat  TEXT;
  v_ulp    TEXT := upper(btrim(COALESCE(p_ulp, '')));
  akar     RECORD;
  urut     INT := 0;
  pokok    INT := 0;
  ch       RECORD;
  nama_akar TEXT;
  kalah    RECORD;
  nama_induk TEXT;
  batas    INT;
BEGIN
  singkat := public.kode_singkat_penyulang(p_penyulang, p_ulp);
  IF singkat IS NULL THEN
    RAISE EXCEPTION 'Penyulang "%" belum punya kode singkat — atur di Pengaturan penyulang', p_penyulang;
  END IF;
  IF p_nama_mulai IS NOT NULL AND upper(btrim(p_nama_mulai)) !~ '[0-9]{3}$' THEN
    RAISE EXCEPTION 'Nama harus diakhiri tiga angka — contoh: PRM-020 atau PRM-015R001';
  END IF;

  DROP TABLE IF EXISTS _sn_simpul;
  CREATE TEMP TABLE _sn_simpul (
    id UUID PRIMARY KEY, induk UUID, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
    cabang BOOLEAN, dibuat TIMESTAMPTZ, lama TEXT, arah_utama TEXT, pindah BOOLEAN DEFAULT false,
    sendiri BOOLEAN DEFAULT false,  -- ★ induknya diatur khusus di penyulang ini
    dalam INT                       -- ★ jumlah tiang dari pangkal (nama dobel)
  ) ON COMMIT DROP;
  DROP TABLE IF EXISTS _sn_hasil;
  CREATE TEMP TABLE _sn_hasil (
    id UUID, lama TEXT, baru TEXT, induk UUID, cabang BOOLEAN, catatan TEXT, urut INT
  ) ON COMMIT DROP;

  -- ★ Induk di penyulang ini: yang diatur khusus (titik pertemuan dua
  -- penyulang), kalau tidak ada baru naik lewat pohon batangnya.
  INSERT INTO _sn_simpul (id, induk, lat, lng, cabang, dibuat, lama, arah_utama, sendiri)
  SELECT t.id, COALESCE(kp.induk_id, public.jtm_leluhur_di_penyulang(t.induk_id, p_penyulang)), t.lat, t.lng,
         COALESCE(t.cabang_baru, false), t.created_at, kp.kode, t.arah_utama_dari_sini, kp.induk_id IS NOT NULL
  FROM public.tiang_kode_penyulang kp
  JOIN public.tiang t ON t.id = kp.tiang_id
  WHERE upper(kp.penyulang) = upper(p_penyulang) AND upper(kp.ulp) = v_ulp AND t.status_hidup = 'aktif';
  UPDATE _sn_simpul s SET induk = NULL
  WHERE s.induk IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _sn_simpul x WHERE x.id = s.induk);

  -- Sisipan lama: tiang yang dititik DI ANTARA J dan anak utamanya tercatat
  -- sebagai saudara (induk keduanya J). Urutan jalurnya dipulihkan: anak yang
  -- lebih jauh (searah ±45°) dipindah menjadi anak tiang yang lebih dekat —
  -- tercatat di pratinjau sebagai "induk dipindah", diterapkan bersama nama.
  -- ★ Kecuali yang induknya diatur khusus: memindahnya akan menulis induk
  -- BATANG-nya, padahal batang itu milik penyulang lain.
  FOR ch IN SELECT x.id, x.induk, x.lat, x.lng FROM _sn_simpul x WHERE x.induk IS NOT NULL AND NOT x.cabang AND NOT x.sendiri LOOP
    UPDATE _sn_simpul c SET induk = pilih.id, pindah = true
    FROM (
      SELECT a.id FROM _sn_simpul a, _sn_simpul j
      WHERE j.id = ch.induk AND a.induk = ch.induk AND a.id <> ch.id AND NOT a.cabang
        AND public.jarak_meter(j.lat, j.lng, a.lat, a.lng) < public.jarak_meter(j.lat, j.lng, ch.lat, ch.lng)
        AND least(abs(public.arah_derajat(j.lat, j.lng, a.lat, a.lng) - public.arah_derajat(j.lat, j.lng, ch.lat, ch.lng)),
                  360 - abs(public.arah_derajat(j.lat, j.lng, a.lat, a.lng) - public.arah_derajat(j.lat, j.lng, ch.lat, ch.lng))) <= 45
      ORDER BY public.jarak_meter(a.lat, a.lng, ch.lat, ch.lng) LIMIT 1
    ) pilih
    WHERE c.id = ch.id;
  END LOOP;

  IF p_utama_paksa IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM _sn_simpul WHERE id = p_utama_paksa AND induk IS NOT NULL) THEN
      RAISE EXCEPTION 'Tiang yang dijadikan jalur utama bukan anak tiang lain di penyulang ini';
    END IF;
    UPDATE _sn_simpul SET cabang = (id <> p_utama_paksa)
    WHERE induk = (SELECT induk FROM _sn_simpul WHERE id = p_utama_paksa);
  END IF;

  IF p_mulai IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _sn_simpul WHERE id = p_mulai) THEN
    RAISE EXCEPTION 'Tiang itu belum punya nama di penyulang %', p_penyulang;
  END IF;

  FOR akar IN
    SELECT s.id, s.lama FROM _sn_simpul s
    WHERE (p_mulai IS NULL AND s.induk IS NULL) OR s.id = p_mulai
    ORDER BY s.dibuat, s.id
  LOOP
    IF p_mulai IS NOT NULL THEN
      nama_akar := upper(btrim(COALESCE(p_nama_mulai, akar.lama)));
    ELSE
      nama_akar := singkat || '-' || lpad((pokok + 1)::text, 3, '0');
    END IF;
    urut := public._jtm_sn_jalan(akar.id, nama_akar, singkat, urut);
    -- Nomor pokok terbesar sejauh ini — akar berikutnya mulai sesudahnya.
    SELECT greatest(pokok, COALESCE(max((regexp_match(r.baru, '([0-9]+)$'))[1]::int), 0)) INTO pokok
    FROM _sn_hasil r WHERE r.baru ~ ('^' || singkat || '-[0-9]+$');
  END LOOP;


  -- ★ Nama dobel (ganti nama sebagian pohon): tiang DI LUAR bagian ini yang
  -- memakai nama baru salah satu tiangnya. Yang LEBIH DEKAT KE PANGKAL (lebih
  -- sedikit tiang dari akarnya) menang. Tiang luar yang lebih ke ujung kalah:
  -- ia + hilirnya diberi nama ulang menurut aturan dari induknya (keputusan
  -- user 22 Okt 2026 — "biasanya yang salah yang di ujung"). Tiang luar yang
  -- lebih dekat pangkal tetap jadi bentrok (diblokir).
  IF p_mulai IS NOT NULL THEN
    WITH RECURSIVE d AS (
      SELECT x.id, 0 AS dalam FROM _sn_simpul x WHERE x.induk IS NULL
      UNION ALL
      SELECT x.id, d.dalam + 1 FROM _sn_simpul x JOIN d ON x.induk = d.id WHERE d.dalam < 5000
    )
    UPDATE _sn_simpul x SET dalam = d.dalam FROM d WHERE d.id = x.id;

    FOR putaran IN 1..50 LOOP
      SELECT x.id, x.induk, x.lama, r.baru AS nama, r.id AS pemenang INTO kalah
      FROM _sn_hasil r
      JOIN _sn_simpul w ON w.id = r.id
      JOIN _sn_simpul x ON upper(x.lama) = upper(r.baru)
      WHERE r.urut > 0
        AND NOT EXISTS (SELECT 1 FROM _sn_hasil y WHERE y.id = x.id)
        AND x.induk IS NOT NULL AND x.dalam IS NOT NULL AND w.dalam IS NOT NULL
        AND x.dalam > w.dalam
      ORDER BY x.dalam, x.id
      LIMIT 1;
      EXIT WHEN NOT FOUND;

      -- Nama tiang yang kalah = nama yang diberikan aturan dari induknya:
      -- telusuri dari induknya (dengan nama induk SESUDAH perubahan ini), lalu
      -- simpan hanya tiang yang kalah + hilirnya.
      SELECT COALESCE((SELECT y.baru FROM _sn_hasil y WHERE y.id = kalah.induk AND y.urut > 0 LIMIT 1),
                      (SELECT p.lama FROM _sn_simpul p WHERE p.id = kalah.induk))
        INTO nama_induk;
      -- Catatan "dianggap cabang" (urut -1) yang sudah ada disisihkan (-2)
      -- supaya bisa dibedakan dari yang lahir di penelusuran ini.
      UPDATE _sn_hasil SET urut = -2 WHERE urut = -1;
      batas := urut;
      urut := public._jtm_sn_jalan(kalah.induk, nama_induk, singkat, urut);
      DROP TABLE IF EXISTS _sn_hilir;
      CREATE TEMP TABLE _sn_hilir ON COMMIT DROP AS
      WITH RECURSIVE hilir AS (
        SELECT kalah.id AS id
        UNION
        SELECT x.id FROM _sn_simpul x JOIN hilir ON x.induk = hilir.id
      )
      SELECT id FROM hilir;
      -- Baris baru di luar hilir tiang yang kalah dibuang (saudara-saudaranya
      -- ikut tertelusuri dari induk yang sama, namanya tidak diubah).
      DELETE FROM _sn_hasil r
      WHERE (r.urut > batas OR r.urut = -1) AND r.id NOT IN (SELECT id FROM _sn_hilir);
      -- Tiang hilir yang sudah punya baris (tiang kalah sebelumnya yang ternyata
      -- di hilir tiang ini): baris lamanya diganti baris baru.
      DELETE FROM _sn_hasil r
      WHERE (r.urut BETWEEN 1 AND batas OR r.urut = -2) AND r.id IN (SELECT id FROM _sn_hilir);
      UPDATE _sn_hasil SET urut = -1 WHERE urut = -2;
      UPDATE _sn_hasil r
      SET catatan = 'nama dobel — ' || kalah.nama || ' dipakai tiang yang lebih dekat ke pangkal'
                    || COALESCE(' (dulu ' || (SELECT w.lama FROM _sn_simpul w WHERE w.id = kalah.pemenang) || ')', '')
                    || '; tiang ini diberi nama dari induknya'
      WHERE r.id = kalah.id AND r.urut > batas;
    END LOOP;
  END IF;

  -- Induk yang dipindah (sisipan) dicatat di baris tiangnya.
  UPDATE _sn_hasil r
  SET catatan = CASE WHEN r.catatan LIKE 'nama dobel%' THEN r.catatan || ' · ' ELSE '' END || 'induk dipindah ke ' || COALESCE((SELECT y.baru FROM _sn_hasil y WHERE y.id = r.induk AND y.urut > 0 LIMIT 1), 'tiang sisipan')
                || ' (tiang sisipan di antaranya)'
  FROM _sn_simpul x WHERE x.id = r.id AND x.pindah AND r.urut > 0;

  -- Catatan "dianggap cabang" dipindah ke baris tiangnya.
  UPDATE _sn_hasil r
  SET catatan = CASE WHEN r.catatan LIKE 'nama dobel%' THEN r.catatan || ' · ' || c.catatan ELSE c.catatan END, cabang = true
  FROM _sn_hasil c WHERE c.urut = -1 AND c.id = r.id AND r.urut > 0;
  DELETE FROM _sn_hasil WHERE urut = -1;

  -- Ganti nama sebagian pohon: nama baru tidak boleh dipakai tiang di luarnya.
  -- ★ Yang tersisa = tiang luar yang lebih dekat ke pangkal (atau sama jauh /
  -- tak terhubung ke pangkal) → tetap diblokir; plus nama yang terpakai dua
  -- kali di dalam hasil ini sendiri (bisa muncul dari nama ulang tiang kalah).
  IF p_mulai IS NOT NULL THEN
    UPDATE _sn_hasil r
    SET catatan = 'bentrok — ' || r.baru || ' sudah dipakai ' || COALESCE(x.lama, 'tiang lain')
                  || ' di luar bagian ini, yang lebih dekat ke pangkal'
    FROM _sn_simpul x
    WHERE upper(x.lama) = upper(r.baru)
      AND NOT EXISTS (SELECT 1 FROM _sn_hasil y WHERE y.id = x.id);
    UPDATE _sn_hasil r
    SET catatan = 'bentrok — ' || r.baru || ' terpakai dua tiang dalam perubahan ini'
    WHERE (r.catatan IS NULL OR r.catatan NOT LIKE 'bentrok%')
      AND EXISTS (SELECT 1 FROM _sn_hasil y WHERE y.id <> r.id AND upper(y.baru) = upper(r.baru));
  END IF;

  RETURN QUERY SELECT r.id, r.lama, r.baru, r.induk, r.cabang, r.catatan FROM _sn_hasil r ORDER BY r.urut;
END $$;

GRANT EXECUTE ON FUNCTION public.susun_nama_jtm(TEXT, TEXT, UUID, TEXT, UUID) TO authenticated;
