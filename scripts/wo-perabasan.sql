-- =============================================================================
-- WO Perabasan — bersatuan SEGMEN, diukur dalam KILOMETER
-- Jalankan SESUDAH `master-segmen.sql`. Idempoten.
--
-- ── KENAPA KM, BUKAN JUMLAH SEGMEN ──────────────────────────────────────────
-- Satu segmen 7 km dan satu segmen 0,3 km bukan pekerjaan yang sebanding.
-- Menghitung keduanya sama-sama "1 segmen selesai" membuat capaian terlihat
-- paling baik justru saat yang dikerjakan ruas-ruas pendek.
--
-- ── BEDANYA DENGAN `wo_pengukuran` ──────────────────────────────────────────
-- Di sana satu WO per ULP per bulan, dijaga indeks unik. Di sini TIDAK: satu
-- WO boleh terbit kapan saja dengan target KM-nya sendiri, dan boleh memuat
-- segmen dari beberapa penyulang sekaligus. Perbedaan itu disengaja — satuan
-- di sana gardu yang sebanding, di sini kilometer yang tidak.
--
-- ── ⚠ KOREKSI RANCANGAN ─────────────────────────────────────────────────────
-- Rencana menyebut `perabasan_realisasi.pohon_id`. Kolom itu TIDAK dibuat:
-- pohon dari inspeksi JTM bukan baris tersendiri, melainkan JAWABAN pada
-- sebuah tiang (`vegetasi` = berpotensi/menyentuh di `tiang_kondisi_terakhir`).
-- Jadi yang menyambungkannya `tiang_id`, dan NULL berarti temuan lapangan di
-- luar daftar. Menyimpan id yang tidak menunjuk apa pun cuma akan membuat
-- orang mencarinya bertahun-tahun kemudian.
-- =============================================================================


-- ── 1. Penjaga hak akses, dipakai bersama ────────────────────────────────────
-- `penyulang_wajib_boleh` dijadikan pembungkus tipis supaya aturannya hidup di
-- SATU tempat. Dua fungsi berisi badan yang sama akan melenceng, dan yang
-- melenceng di sini berarti satu modul memperbolehkan apa yang ditolak modul
-- sebelah — tanpa ada galat yang memberitahu siapa pun.

CREATE OR REPLACE FUNCTION public.wajib_boleh_ulp(p_ulp TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r TEXT;
  u TEXT;
BEGIN
  SELECT role, unit INTO r, u FROM public.user_roles WHERE user_id = auth.uid();

  IF r = 'UP3' THEN RETURN; END IF;
  IF r = 'admin' AND upper(COALESCE(u, '')) = upper(COALESCE(p_ulp, '')) THEN RETURN; END IF;

  RAISE EXCEPTION
    'Anda tidak berhak mengubah data ULP %. Yang boleh: UP3 (semua ULP) dan admin ULP itu sendiri.',
    COALESCE(p_ulp, '-');
END $fn$;

CREATE OR REPLACE FUNCTION public.penyulang_wajib_boleh(p_ulp TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.wajib_boleh_ulp(p_ulp);
$fn$;


-- ── 2. Header WO ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wo_perabasan (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ulp        TEXT NOT NULL,
  nama       TEXT NOT NULL,
  tgl_wo     DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Targetnya KILOMETER. Sengaja bukan jumlah segmen — lihat kepala berkas.
  target_km  NUMERIC(8,2) NOT NULL CHECK (target_km > 0 AND target_km <= 5000),

  status     TEXT NOT NULL DEFAULT 'Terbit',
  catatan    TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wo_perabasan DROP CONSTRAINT IF EXISTS wo_perabasan_status_valid;
ALTER TABLE public.wo_perabasan ADD CONSTRAINT wo_perabasan_status_valid
  CHECK (status IN ('Terbit', 'Selesai', 'Dibatalkan'));

CREATE INDEX IF NOT EXISTS wo_perabasan_ulp_idx ON public.wo_perabasan (ulp, tgl_wo DESC);

COMMENT ON TABLE public.wo_perabasan IS
  'WO perabasan. Boleh beberapa dalam sebulan dan boleh lintas penyulang — ukurannya total KM, bukan jumlah segmen atau bulan penerbitan.';


-- ── 3. Item: satu baris per SEGMEN ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wo_perabasan_item (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id     UUID NOT NULL REFERENCES public.wo_perabasan(id) ON DELETE CASCADE,
  segmen_id UUID NOT NULL REFERENCES public.segmen(id) ON DELETE RESTRICT,
  urutan    INT  NOT NULL DEFAULT 0,
  ulp       TEXT NOT NULL,

  -- ── Potret saat WO terbit ──
  -- Disalin, bukan di-join saat ditampilkan. WO adalah dokumen bertanggal:
  -- kalau nama segmen atau panjangnya berubah di pertengahan bulan, lembar
  -- yang sudah dipegang regu tidak boleh ikut berubah.
  penyulang    TEXT NOT NULL,
  segmen_nama  TEXT NOT NULL,
  panjang_km   NUMERIC(8,3),

  -- ⚠ IKUT DISIMPAN, DAN INI PENTING. Tanpa kolom ini capaian km bulan ini
  -- tidak bisa dibandingkan dengan bulan lalu: sebagian angkanya hasil ukuran
  -- dari bentang tiang, sebagian lagi ketikan admin, dan enam bulan lagi tidak
  -- ada yang ingat yang mana.
  panjang_dari TEXT,

  -- ── Pelaksanaan ──
  status        TEXT NOT NULL DEFAULT 'Dijadwalkan',
  tgl_mulai     DATE,
  tgl_selesai   DATE,
  petugas_nama  TEXT,
  petugas_uid   UUID,
  catatan       TEXT,

  verified_at   TIMESTAMPTZ,
  verified_by   UUID,
  verified_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (wo_id, segmen_id)
);

-- Kosakata statusnya SAMA dengan inspeksi JTR/JTM dan pemeliharaan gardu.
-- Bukan demi kerapian: regu dan admin sudah hafal artinya, dan kata baru
-- berarti mengajari ulang seluruh unit.
ALTER TABLE public.wo_perabasan_item DROP CONSTRAINT IF EXISTS wo_perabasan_item_status_valid;
ALTER TABLE public.wo_perabasan_item ADD CONSTRAINT wo_perabasan_item_status_valid
  CHECK (status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Diverifikasi', 'Ditolak', 'Dibatalkan'));

ALTER TABLE public.wo_perabasan_item DROP CONSTRAINT IF EXISTS wo_perabasan_item_panjang_dari_valid;
ALTER TABLE public.wo_perabasan_item ADD CONSTRAINT wo_perabasan_item_panjang_dari_valid
  CHECK (panjang_dari IS NULL OR panjang_dari IN ('hitungan', 'ketikan', 'kosong'));

CREATE INDEX IF NOT EXISTS wo_perabasan_item_wo_idx     ON public.wo_perabasan_item (wo_id, urutan);
CREATE INDEX IF NOT EXISTS wo_perabasan_item_segmen_idx ON public.wo_perabasan_item (segmen_id);

-- Satu segmen tidak boleh berada di DUA WO yang masih berjalan. Kalau boleh,
-- kilometernya terhitung dua kali dan capaian gabungan melebihi panjang
-- jaringan yang sebenarnya ada — tanpa satu pun angka yang terlihat aneh.
--
-- 'Ditolak' IKUT DIHITUNG BERJALAN, dan itu disengaja: item yang dikembalikan
-- admin masih jadi kewajiban regu di WO-nya sendiri. Kalau dia langsung bebas
-- masuk WO lain, ruas yang sama muncul di dua lembar tugas sekaligus dan regu
-- mengerjakannya dua kali. Untuk memindahkannya, batalkan dulu dengan alasan —
-- hanya 'Dibatalkan' dan 'Diverifikasi' yang benar-benar melepaskannya.
CREATE UNIQUE INDEX IF NOT EXISTS wo_perabasan_item_segmen_aktif_unik
  ON public.wo_perabasan_item (segmen_id)
  WHERE status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak');

COMMENT ON TABLE public.wo_perabasan_item IS
  'Satu segmen di dalam sebuah WO perabasan. Identitas dan panjangnya POTRET saat terbit — WO adalah dokumen bertanggal.';


-- ── 4. Realisasi: satu baris per POHON yang dikerjakan ───────────────────────

CREATE TABLE IF NOT EXISTS public.perabasan_realisasi (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.wo_perabasan_item(id) ON DELETE CASCADE,

  -- NULL = pohon yang ditemukan regu di luar daftar inspeksi. Bukan kekurangan:
  -- gelombang pertama justru akan didominasi temuan lapangan, karena inspeksi
  -- JTM baru menelusuri sebagian kecil jaringan.
  tiang_id UUID REFERENCES public.tiang(id) ON DELETE SET NULL,

  jenis_pohon TEXT,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),

  -- WAJIB KEDUANYA, dijaga di database dan bukan hanya di aplikasi. Realisasi
  -- tanpa bukti tidak bisa diverifikasi, dan tidak bisa dibandingkan dengan
  -- keadaan sesudahnya. Penjaga yang cuma ada di aplikasi akan terlewati oleh
  -- versi aplikasi berikutnya yang lupa memasangnya.
  foto_sebelum_url TEXT NOT NULL,
  foto_sesudah_url TEXT NOT NULL,

  petugas_nama  TEXT,
  petugas_uid   UUID,
  dikerjakan_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  catatan       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS perabasan_realisasi_item_idx  ON public.perabasan_realisasi (item_id);
CREATE INDEX IF NOT EXISTS perabasan_realisasi_tiang_idx ON public.perabasan_realisasi (tiang_id);

COMMENT ON TABLE public.perabasan_realisasi IS
  'Satu pohon yang dirabas. tiang_id NULL = temuan lapangan di luar daftar inspeksi. Dua foto WAJIB — realisasi tanpa bukti tidak bisa diverifikasi.';


-- ── 5. Pohon yang menunggu di tiap segmen ────────────────────────────────────
-- Satu-satunya sumber untuk sekarang: jawaban `vegetasi` pada inspeksi JTM yang
-- SUDAH DIVERIFIKASI. `inspeksi_pohon` (5.691 baris warisan) sengaja di luar
-- cakupan — 3.224 barisnya memuat nama KEYPOINT di kolom penyulang, jadi tidak
-- bisa disambungkan ke segmen tanpa pekerjaan pemetaan tersendiri.

CREATE OR REPLACE VIEW public.perabasan_pohon AS
SELECT
  st.segmen_id,
  k.tiang_id,
  t.kode        AS tiang_kode,
  t.lat,
  t.lng,
  k.nilai       AS vegetasi,
  (SELECT j.nilai FROM public.tiang_kondisi_terakhir j
    WHERE j.tiang_id = k.tiang_id AND j.item_kode = 'jenis_pohon' LIMIT 1) AS jenis_pohon,
  k.tgl         AS tgl_inspeksi
FROM public.tiang_kondisi_terakhir k
JOIN public.segmen_tiang st ON st.tiang_id = k.tiang_id
JOIN public.tiang t         ON t.id = k.tiang_id
WHERE k.item_kode = 'vegetasi'
  AND k.nilai IN ('berpotensi', 'menyentuh');

COMMENT ON VIEW public.perabasan_pohon IS
  'Pohon yang menunggu dirabas per segmen, dari jawaban vegetasi inspeksi JTM yang sudah diverifikasi. Bukan daftar lengkap — regu tetap boleh melaporkan pohon di luar ini.';


-- ── 6. Capaian WO ────────────────────────────────────────────────────────────
-- Capaian dihitung dari item DIVERIFIKASI saja. Yang berstatus Selesai belum
-- masuk: laporan yang belum diperiksa siapa pun bukan capaian, dan kalau ikut
-- dihitung maka angka itu akan turun lagi saat admin menolaknya — grafik yang
-- bisa turun sendiri membuat orang berhenti mempercayainya.

CREATE OR REPLACE VIEW public.wo_perabasan_capaian AS
SELECT
  w.id AS wo_id,
  w.ulp,
  w.nama,
  w.tgl_wo,
  w.target_km,
  w.status,
  count(i.id)                                                     AS item,
  count(i.id) FILTER (WHERE i.status = 'Diverifikasi')            AS item_selesai,
  round(COALESCE(sum(i.panjang_km), 0), 2)                        AS rencana_km,
  round(COALESCE(sum(i.panjang_km) FILTER (WHERE i.status = 'Diverifikasi'), 0), 2) AS capaian_km,

  -- ⚠ Dipisah, bukan dijumlah buta. Capaian dari segmen berpanjang ketikan
  -- TIDAK sebanding dengan yang dihitung dari bentang tiang; tanpa pemisahan
  -- ini, capaian bulan ini dan bulan lalu diam-diam mengukur hal berbeda.
  round(COALESCE(sum(i.panjang_km) FILTER (
    WHERE i.status = 'Diverifikasi' AND i.panjang_dari = 'hitungan'), 0), 2) AS capaian_km_hitungan,
  round(COALESCE(sum(i.panjang_km) FILTER (
    WHERE i.status = 'Diverifikasi' AND i.panjang_dari = 'ketikan'), 0), 2)  AS capaian_km_ketikan,

  CASE WHEN w.target_km > 0 THEN
    round(COALESCE(sum(i.panjang_km) FILTER (WHERE i.status = 'Diverifikasi'), 0)
          / w.target_km * 100, 1)
  END                                                             AS capaian_persen,
  (SELECT count(*) FROM public.perabasan_realisasi r
    JOIN public.wo_perabasan_item x ON x.id = r.item_id
   WHERE x.wo_id = w.id)                                          AS pohon_dirabas
FROM public.wo_perabasan w
LEFT JOIN public.wo_perabasan_item i ON i.wo_id = w.id
GROUP BY w.id;

COMMENT ON VIEW public.wo_perabasan_capaian IS
  'Capaian WO perabasan dalam KM. Hanya item Diverifikasi yang dihitung, dan capaiannya dipisah antara km hasil hitungan dan km hasil ketikan — keduanya tidak sebanding.';


-- ── 7. Menerbitkan WO ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.terbitkan_wo_perabasan(
  p_ulp       TEXT,
  p_nama      TEXT,
  p_target_km NUMERIC,
  p_segmen    UUID[],
  p_tgl_wo    DATE DEFAULT CURRENT_DATE,
  p_oleh      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  unit     TEXT := upper(btrim(COALESCE(p_ulp, '')));
  judul    TEXT := btrim(COALESCE(p_nama, ''));
  wo       UUID;
  s        RECORD;
  n        INT := 0;
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

    -- Sudah ada di WO lain yang masih berjalan? Ditolak di sini dengan
    -- keterangan, bukan dibiarkan menabrak indeks unik dengan pesan yang tidak
    -- menyebut segmen mana.
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

    n := n + 1;
    INSERT INTO public.wo_perabasan_item (
      wo_id, segmen_id, urutan, ulp, penyulang, segmen_nama, panjang_km, panjang_dari
    ) VALUES (
      wo, s.segmen_id, n, s.ulp, s.penyulang, s.nama, s.panjang_pakai_km, s.panjang_dari
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
          jsonb_build_object('wo_id', wo, 'item', n, 'target_km', p_target_km),
          'sunting_admin', auth.uid(), p_oleh);

  RETURN jsonb_build_object(
    'wo_id', wo, 'nama', judul, 'ulp', unit,
    'item', n, 'dilewati', dilewati,
    'rencana_km', (SELECT rencana_km FROM public.wo_perabasan_capaian WHERE wo_id = wo));
END $fn$;


-- ── 8. Regu mengerjakan ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mulai_perabasan_segmen(
  p_item_id UUID,
  p_petugas TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE public.wo_perabasan_item
  SET status = 'Dalam Proses',
      tgl_mulai = COALESCE(tgl_mulai, CURRENT_DATE),
      petugas_nama = COALESCE(p_petugas, petugas_nama),
      petugas_uid = COALESCE(auth.uid(), petugas_uid),
      updated_at = now()
  WHERE id = p_item_id AND status IN ('Dijadwalkan', 'Dalam Proses', 'Ditolak');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Segmen ini tidak bisa dimulai — mungkin sudah dilaporkan selesai atau sudah diverifikasi.';
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.selesaikan_perabasan_segmen(
  p_item_id UUID,
  p_catatan TEXT DEFAULT NULL,
  p_petugas TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM public.perabasan_realisasi WHERE item_id = p_item_id;

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
END $fn$;


-- ── 9. Admin memutuskan ──────────────────────────────────────────────────────
-- Satu fungsi untuk menerima maupun menolak. Dua fungsi terpisah akan membuat
-- salah satunya lupa menulis jejak audit — dan yang lupa itu tidak pernah
-- ketahuan, karena tidak ada galat saat sesuatu TIDAK ditulis.

CREATE OR REPLACE FUNCTION public.putuskan_perabasan_segmen(
  p_item_id UUID,
  p_terima  BOOLEAN,
  p_catatan TEXT DEFAULT NULL,
  p_oleh    TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it RECORD;
BEGIN
  SELECT * INTO it FROM public.wo_perabasan_item WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item WO tidak ditemukan'; END IF;

  PERFORM public.wajib_boleh_ulp(it.ulp);

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
END $fn$;


-- ── 10. Membatalkan ──────────────────────────────────────────────────────────
-- Dibatalkan, BUKAN dihapus — sepola `batalkan_tiang` dan kawan-kawannya.
-- Segmen yang dibatalkan keluar dari indeks unik, jadi bisa masuk WO berikutnya.

CREATE OR REPLACE FUNCTION public.batalkan_perabasan_item(
  p_item_id UUID,
  p_alasan  TEXT,
  p_oleh    TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it RECORD;
BEGIN
  SELECT * INTO it FROM public.wo_perabasan_item WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item WO tidak ditemukan'; END IF;

  PERFORM public.wajib_boleh_ulp(it.ulp);

  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi. Tanpa itu, enam bulan lagi tidak ada yang bisa menjawab kenapa segmen ini keluar dari WO.';
  END IF;

  IF it.status = 'Diverifikasi' THEN
    RAISE EXCEPTION 'Segmen yang sudah diverifikasi tidak bisa dibatalkan — capaiannya sudah terhitung.';
  END IF;

  UPDATE public.wo_perabasan_item
  SET status = 'Dibatalkan', catatan = p_alasan, updated_at = now()
  WHERE id = p_item_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_perabasan_item', it.segmen_nama, it.ulp, 'dibatalkan',
          to_jsonb(it.status), to_jsonb(p_alasan), 'sunting_admin', auth.uid(), p_oleh);
END $fn$;


-- ── 11. Hak akses ────────────────────────────────────────────────────────────

ALTER TABLE public.wo_perabasan        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_perabasan_item   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perabasan_realisasi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_perabasan_baca        ON public.wo_perabasan;
DROP POLICY IF EXISTS wo_perabasan_item_baca   ON public.wo_perabasan_item;
DROP POLICY IF EXISTS perabasan_realisasi_baca ON public.perabasan_realisasi;
DROP POLICY IF EXISTS perabasan_realisasi_tulis ON public.perabasan_realisasi;

CREATE POLICY wo_perabasan_baca        ON public.wo_perabasan        FOR SELECT TO authenticated USING (true);
CREATE POLICY wo_perabasan_item_baca   ON public.wo_perabasan_item   FOR SELECT TO authenticated USING (true);
CREATE POLICY perabasan_realisasi_baca ON public.perabasan_realisasi FOR SELECT TO authenticated USING (true);

-- Realisasi DITULIS LANGSUNG oleh aplikasi petugas, tidak lewat fungsi. Yang
-- perlu dijaga di sini cuma kelengkapan fotonya, dan itu sudah dikerjakan
-- NOT NULL di tabelnya — penjaga yang tidak bisa dilewati versi aplikasi mana pun.
CREATE POLICY perabasan_realisasi_tulis ON public.perabasan_realisasi
  FOR INSERT TO authenticated WITH CHECK (true);

GRANT SELECT ON public.wo_perabasan, public.wo_perabasan_item,
                public.perabasan_realisasi, public.perabasan_pohon,
                public.wo_perabasan_capaian TO authenticated;
GRANT INSERT ON public.perabasan_realisasi TO authenticated;

GRANT EXECUTE ON FUNCTION public.wajib_boleh_ulp                TO authenticated;
GRANT EXECUTE ON FUNCTION public.terbitkan_wo_perabasan         TO authenticated;
GRANT EXECUTE ON FUNCTION public.mulai_perabasan_segmen         TO authenticated;
GRANT EXECUTE ON FUNCTION public.selesaikan_perabasan_segmen    TO authenticated;
GRANT EXECUTE ON FUNCTION public.putuskan_perabasan_segmen      TO authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_perabasan_item        TO authenticated;


-- =============================================================================
-- Periksa hasilnya
-- =============================================================================
-- a. Terbitkan WO dari segmen yang paling lama tidak diinspeksi:
--      SELECT jsonb_pretty(terbitkan_wo_perabasan(
--        'AMPENAN', 'Perabasan Oktober 2026', 25.0,
--        ARRAY(SELECT segmen_id FROM master_segmen
--              WHERE ulp = 'AMPENAN' AND status = 'aktif'
--              ORDER BY umur_inspeksi_bulan DESC NULLS FIRST LIMIT 5),
--        CURRENT_DATE, 'uji'));
--
-- b. Capaian tiap WO — perhatikan km hitungan dan km ketikan DIPISAH:
--      SELECT nama, target_km, rencana_km, capaian_km,
--             capaian_km_hitungan, capaian_km_ketikan, capaian_persen,
--             item, item_selesai, pohon_dirabas
--      FROM wo_perabasan_capaian ORDER BY tgl_wo DESC;
--
-- c. Pohon yang menunggu di tiap segmen — kosong sampai inspeksi JTM pertama
--    diverifikasi, dan itu wajar:
--      SELECT s.nama, count(*) FROM perabasan_pohon p
--      JOIN segmen s ON s.id = p.segmen_id GROUP BY 1 ORDER BY 2 DESC;
--
-- d. Segmen yang TIDAK bisa masuk WO baru karena masih berjalan di WO lain:
--      SELECT segmen_nama, status, wo_id FROM wo_perabasan_item
--      WHERE status IN ('Dijadwalkan', 'Dalam Proses', 'Selesai', 'Ditolak')
--      ORDER BY segmen_nama;
-- =============================================================================
