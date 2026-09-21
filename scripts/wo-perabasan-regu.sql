-- =============================================================================
-- WO Perabasan: tiap segmen ditugaskan ke REGU tertentu
-- Jalankan SESUDAH `wo-perabasan.sql`. Idempoten.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
-- Temuan sudah bekerja begini: yang ditugaskan ke RABAS 1 hanya muncul di
-- RABAS 1, tidak bercampur (`inspeksi.team_name`). WO perabasan harus sama —
-- kalau tidak, empat regu di ULP TANJUNG membuka daftar yang persis sama dan
-- tiga di antaranya mengerjakan ruas yang sudah dikerjakan regu pertama.
--
-- ── DARI MANA NAMA REGUNYA ──────────────────────────────────────────────────
-- Dari tabel `petugas` yang ber-`group_name = 'PERABASAN'`. Diperiksa
-- 21 Sep 2026: AMPENAN punya RABAS 1–3, TANJUNG punya RABAS 1–4.
--
-- BUKAN dari `user_roles`. Di sana hanya ada SATU akun PERABASAN per ULP
-- ("Rabas Ampenan", "Rabas Tanjung") — akun itu dipakai bersama, dan regunya
-- dipilih saat login. Karena itu pula database TIDAK bisa memaksa regu A
-- berhenti membuka pekerjaan regu B: bagi database keduanya orang yang sama.
-- Pemisahannya dikerjakan layar, persis seperti yang sudah berlaku untuk
-- temuan — dan itu disebut di sini supaya tidak dikira penjagaan yang lupa
-- dipasang.
-- =============================================================================


-- ── 1. Kolom regu ────────────────────────────────────────────────────────────

ALTER TABLE public.wo_perabasan_item
  ADD COLUMN IF NOT EXISTS regu TEXT;

COMMENT ON COLUMN public.wo_perabasan_item.regu IS
  'Nama regu yang ditugasi, dari petugas.nama ber-group_name PERABASAN (mis. "RABAS 1"). NULL = belum ditugaskan, dan selama NULL segmen ini TIDAK muncul di HP regu mana pun.';

-- Dipakai HP tiap kali daftar dibuka: satu regu, satu ULP, status berjalan.
CREATE INDEX IF NOT EXISTS wo_perabasan_item_regu_idx
  ON public.wo_perabasan_item (ulp, regu, status);


-- ── 2. Regu yang tersedia per ULP ────────────────────────────────────────────
-- Disediakan sebagai view supaya layar penerbitan tidak perlu tahu bahwa
-- daftar regu sebenarnya tinggal di tabel `petugas` — dan supaya kalau kelak
-- pindah tempat, yang berubah cuma satu definisi di sini.

CREATE OR REPLACE VIEW public.regu_perabasan AS
SELECT
  p.nama AS regu,
  p.ulp,
  p.status,
  (SELECT count(*) FROM public.wo_perabasan_item i
    WHERE i.regu = p.nama AND i.ulp = p.ulp
      AND i.status IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak'))   AS segmen_berjalan,
  (SELECT COALESCE(round(sum(i.panjang_km), 2), 0) FROM public.wo_perabasan_item i
    WHERE i.regu = p.nama AND i.ulp = p.ulp
      AND i.status IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak'))   AS km_berjalan
FROM public.petugas p
WHERE upper(COALESCE(p.group_name, '')) = 'PERABASAN'
  AND lower(COALESCE(p.status, 'aktif')) = 'aktif';

COMMENT ON VIEW public.regu_perabasan IS
  'Regu rabas yang aktif per ULP, beserta berapa segmen dan berapa km yang sedang dipikulnya. Angka itu yang membuat pembagian tugas bisa dilihat timpang atau tidak sebelum WO terbit.';


-- ── 3. Menerbitkan WO, sekalian membagi regu ─────────────────────────────────
-- Tanda tangannya bertambah satu parameter, jadi fungsinya dibuang dulu:
-- menambah parameter lewat CREATE OR REPLACE justru melahirkan fungsi KEDUA
-- dengan nama sama, dan PostgREST lalu tidak bisa memutuskan yang mana yang
-- dipanggil.
--
-- `p_regu` memetakan segmen_id → nama regu:
--     {"9f3a…": "RABAS 1", "2c7b…": "RABAS 2"}
-- Segmen yang tidak disebut masuk tanpa regu, dan itu sah — tapi layar harus
-- mengatakannya, karena selama regunya kosong tidak ada satu pun HP yang
-- menampilkannya.

DROP FUNCTION IF EXISTS public.terbitkan_wo_perabasan(TEXT, TEXT, NUMERIC, UUID[], DATE, TEXT);

CREATE OR REPLACE FUNCTION public.terbitkan_wo_perabasan(
  p_ulp       TEXT,
  p_nama      TEXT,
  p_target_km NUMERIC,
  p_segmen    UUID[],
  p_tgl_wo    DATE    DEFAULT CURRENT_DATE,
  p_regu      JSONB   DEFAULT '{}'::jsonb,
  p_oleh      TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  unit     TEXT := upper(btrim(COALESCE(p_ulp, '')));
  judul    TEXT := btrim(COALESCE(p_nama, ''));
  wo       UUID;
  s        RECORD;
  n        INT := 0;
  tanpa    INT := 0;
  -- BUKAN `regu`. Nama itu bentrok dengan kolom `regu` di view
  -- `regu_perabasan`, dan PostgreSQL menolaknya dengan "column reference is
  -- ambiguous" — hanya SAAT DIJALANKAN, bukan saat fungsinya dibuat.
  nama_regu TEXT;
  dilewati JSONB := '[]'::jsonb;
BEGIN
  IF unit = '' THEN RAISE EXCEPTION 'ULP belum dipilih'; END IF;
  IF judul = '' THEN RAISE EXCEPTION 'Nama WO belum diisi'; END IF;
  IF COALESCE(array_length(p_segmen, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Belum ada segmen yang dipilih';
  END IF;

  PERFORM public.wajib_boleh_ulp(unit);

  INSERT INTO public.wo_perabasan (ulp, nama, tgl_wo, target_km, created_by)
  VALUES (unit, judul, COALESCE(p_tgl_wo, CURRENT_DATE), p_target_km, auth.uid())
  RETURNING id INTO wo;

  FOR s IN
    SELECT * FROM public.master_segmen
    WHERE segmen_id = ANY(p_segmen)
    ORDER BY penyulang, nama
  LOOP
    IF upper(s.ulp) <> unit THEN
      dilewati := dilewati || jsonb_build_object(
        'segmen', s.nama, 'sebab', format('Milik ULP %s, bukan %s.', s.ulp, unit));
      CONTINUE;
    END IF;

    IF s.status <> 'aktif' THEN
      dilewati := dilewati || jsonb_build_object(
        'segmen', s.nama, 'sebab', 'Segmen tidak aktif.');
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.wo_perabasan_item x
      WHERE x.segmen_id = s.segmen_id
        AND x.status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak')
    ) THEN
      dilewati := dilewati || jsonb_build_object(
        'segmen', s.nama,
        'sebab', format('Masih berjalan di WO lain (%s). Batalkan dulu di sana kalau memang mau dipindahkan.',
                        (SELECT x.status FROM public.wo_perabasan_item x
                          WHERE x.segmen_id = s.segmen_id
                            AND x.status IN ('Dijadwalkan','Dalam Proses','Selesai','Ditolak') LIMIT 1)));
      CONTINUE;
    END IF;

    nama_regu := NULLIF(btrim(COALESCE(p_regu ->> s.segmen_id::text, '')), '');

    -- Regu yang tidak dikenal DITOLAK, bukan disimpan apa adanya. Nama yang
    -- salah ketik akan menghasilkan segmen yang tidak muncul di HP siapa pun,
    -- dan tidak ada satu pun galat yang memberi tahu — kelihatannya seperti
    -- regu yang tidak bekerja.
    IF nama_regu IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.regu_perabasan r WHERE r.regu = nama_regu AND upper(r.ulp) = unit
    ) THEN
      dilewati := dilewati || jsonb_build_object(
        'segmen', s.nama, 'sebab', format('Regu "%s" tidak terdaftar di ULP %s.', nama_regu, unit));
      CONTINUE;
    END IF;

    IF nama_regu IS NULL THEN tanpa := tanpa + 1; END IF;

    n := n + 1;
    INSERT INTO public.wo_perabasan_item (
      wo_id, segmen_id, urutan, ulp, penyulang, segmen_nama, panjang_km, panjang_dari, regu
    ) VALUES (
      wo, s.segmen_id, n, s.ulp, s.penyulang, s.nama, s.panjang_pakai_km, s.panjang_dari, nama_regu
    );
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'Tidak ada satu pun segmen yang bisa dimasukkan. %',
      COALESCE((SELECT string_agg(d ->> 'segmen' || ': ' || (d ->> 'sebab'), ' | ')
                FROM jsonb_array_elements(dilewati) d), '');
  END IF;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_perabasan', judul, unit, 'terbit', NULL,
          jsonb_build_object('wo_id', wo, 'item', n, 'target_km', p_target_km,
                             'tanpa_regu', tanpa),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object(
    'wo_id', wo, 'nama', judul, 'ulp', unit,
    'item', n,
    -- Dilaporkan terpisah supaya layar bisa menyebutnya: segmen tanpa regu
    -- tidak muncul di HP mana pun sampai ditugaskan.
    'tanpa_regu', tanpa,
    'dilewati', dilewati,
    'rencana_km', (SELECT rencana_km FROM public.wo_perabasan_capaian WHERE wo_id = wo));
END $fn$;


-- ── 4. Memindahkan segmen ke regu lain ───────────────────────────────────────
-- Regu berubah di tengah bulan — ada yang cuti, ada yang dialihkan ke gangguan.
-- Tanpa ini, satu-satunya cara memindahkan pekerjaan adalah membatalkan
-- itemnya lalu menerbitkan WO baru, dan capaian km-nya pecah dua.

CREATE OR REPLACE FUNCTION public.tugaskan_regu_segmen(
  p_item_id UUID,
  p_regu    TEXT,
  p_oleh    TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it   RECORD;
  baru TEXT := NULLIF(btrim(COALESCE(p_regu, '')), '');
BEGIN
  SELECT * INTO it FROM public.wo_perabasan_item WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item WO tidak ditemukan'; END IF;

  PERFORM public.wajib_boleh_ulp(it.ulp);

  IF it.status IN ('Diverifikasi', 'Dibatalkan') THEN
    RAISE EXCEPTION 'Segmen berstatus % tidak bisa dipindahkan regunya.', it.status;
  END IF;

  IF baru IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.regu_perabasan r
    WHERE r.regu = baru AND upper(r.ulp) = upper(it.ulp)
  ) THEN
    RAISE EXCEPTION 'Regu "%" tidak terdaftar di ULP %.', baru, it.ulp;
  END IF;

  -- Memindahkan pekerjaan yang SUDAH DILAPORKAN regu lain akan membuat nama
  -- yang tercatat mengerjakannya berbeda dari regu yang tertulis di WO, dan
  -- tidak ada yang bisa menjelaskan selisihnya belakangan.
  IF it.status = 'Selesai' THEN
    RAISE EXCEPTION
      'Segmen ini sudah dilaporkan selesai oleh %. Putuskan dulu (terima atau kembalikan), baru regunya boleh dipindah.',
      COALESCE(it.petugas_nama, 'regu sebelumnya');
  END IF;

  UPDATE public.wo_perabasan_item
  SET regu = baru, updated_at = now()
  WHERE id = p_item_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_perabasan_item', it.segmen_nama, it.ulp, 'regu',
          to_jsonb(it.regu), to_jsonb(baru), 'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object('item_id', p_item_id, 'regu', baru);
END $fn$;


-- ── 5. Capaian per regu ──────────────────────────────────────────────────────
-- Ukurannya KM, sama seperti WO-nya. Jumlah segmen tidak dipakai di sini
-- dengan alasan yang sama: ruas 7 km dan ruas 0,3 km bukan beban yang sama,
-- dan membandingkan regu dengan cacah segmen akan menguntungkan yang kebagian
-- ruas-ruas pendek.

-- Pohon dihitung per ITEM lebih dulu, baru dijumlah. Versi pertama memakai
-- subquery berkorelasi ke `i.regu` — dan PostgreSQL menolaknya, benar:
-- kolom itu tidak ikut GROUP BY, jadi tidak ada satu nilai pun yang bisa
-- dirujuk dari dalam kelompoknya.
CREATE OR REPLACE VIEW public.perabasan_capaian_regu AS
WITH pohon AS (
  SELECT item_id, count(*) AS n
  FROM public.perabasan_realisasi
  GROUP BY item_id
)
SELECT
  i.ulp,
  COALESCE(i.regu, '(belum ditugaskan)')                                  AS regu,
  count(*)                                                                AS segmen,
  count(*) FILTER (WHERE i.status = 'Diverifikasi')                       AS segmen_selesai,
  round(COALESCE(sum(i.panjang_km), 0), 2)                                AS km_ditugaskan,
  round(COALESCE(sum(i.panjang_km) FILTER (WHERE i.status = 'Diverifikasi'), 0), 2) AS km_selesai,
  COALESCE(sum(p.n), 0)::BIGINT                                           AS pohon
FROM public.wo_perabasan_item i
LEFT JOIN pohon p ON p.item_id = i.id
WHERE i.status <> 'Dibatalkan'
GROUP BY i.ulp, COALESCE(i.regu, '(belum ditugaskan)');

COMMENT ON VIEW public.perabasan_capaian_regu IS
  'Capaian tiap regu rabas dalam KM. Baris "(belum ditugaskan)" adalah pekerjaan yang tidak muncul di HP siapa pun — harus nol, dan kalau tidak, ada WO yang terbit tanpa pembagian regu.';


-- ── 6. Hak akses ─────────────────────────────────────────────────────────────

GRANT SELECT  ON public.regu_perabasan            TO authenticated;
GRANT SELECT  ON public.perabasan_capaian_regu    TO authenticated;
GRANT EXECUTE ON FUNCTION public.terbitkan_wo_perabasan TO authenticated;
GRANT EXECUTE ON FUNCTION public.tugaskan_regu_segmen   TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Regu yang tersedia, beserta beban yang sedang dipikulnya:
--      SELECT * FROM regu_perabasan ORDER BY ulp, regu;
--
-- b. ⚠ HARUS KOSONG. Kalau berisi, ada segmen yang tidak muncul di HP siapa pun:
--      SELECT ulp, segmen, km_ditugaskan FROM perabasan_capaian_regu
--      WHERE regu = '(belum ditugaskan)';
--
-- c. Pembagian beban antar regu — timpang atau tidak:
--      SELECT ulp, regu, segmen, km_ditugaskan, km_selesai, pohon
--      FROM perabasan_capaian_regu ORDER BY ulp, km_ditugaskan DESC;
--
-- d. Terbitkan WO sekalian membagi regu:
--      SELECT jsonb_pretty(terbitkan_wo_perabasan(
--        'AMPENAN', 'Perabasan Oktober', 25.0,
--        ARRAY['<segmen_id_1>'::uuid, '<segmen_id_2>'::uuid],
--        CURRENT_DATE,
--        '{"<segmen_id_1>": "RABAS 1", "<segmen_id_2>": "RABAS 2"}'::jsonb,
--        'uji'));
--
-- e. Pindahkan satu segmen ke regu lain:
--      SELECT tugaskan_regu_segmen('<item_id>'::uuid, 'RABAS 3', 'uji');
-- =============================================================================
