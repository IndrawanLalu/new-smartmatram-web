-- =============================================================================
-- Pola pembatalan WO Perabasan diterapkan ke SEMUA WO (disetujui user
-- 29 Sep 2026): Inspeksi JTM/JTR, Pemeliharaan Gardu, Pengukuran.
-- Jalankan SESUDAH `wo-batal-perabasan.sql`. Idempoten.
--
-- Aturan yang sama di semua WO:
--   • Objek yang SUDAH DIKERJAKAN tidak bisa dikeluarkan dari WO.
--   • Keluarkan banyak objek sekaligus; yang tidak bisa DILEWATI dengan sebab.
--   • WO yang salah DIBATALKAN beserta alasannya, bukan dihapus
--     (teknisaplikasi.md butir 12) — hanya kalau belum ada yang dikerjakan.
--
-- "Sudah dikerjakan":
--   Inspeksi JTM/JTR  — ada inspeksi (bukan yang dibatalkan) yang tersambung
--                        ke item itu, atau itemnya sudah bukan 'Terbuka'.
--   Pemeliharaan Gardu — pemeliharaan WO itu sudah dikirim regu.
--   Pengukuran         — pengukuran WO itu sudah masuk.
--
-- ── KENAPA WO GARDU MEMAKAI ARSIP, BUKAN KOLOM STATUS ───────────────────────
-- Baris WO Pemeliharaan & Pengukuran tidak punya kolom status, dan view
-- realisasinya dibaca HP regu serta Rekap Kinerja. Menambah status berarti
-- membongkar view-view itu dan menyaring di setiap pembacanya — satu yang
-- terlewat membuat gardu yang dibatalkan tetap muncul di HP. Jadi barisnya
-- dipindah utuh ke `wo_batal_arsip` beserta alasannya, lalu dilepas dari WO:
-- tetap tersimpan dan beralasan, dan tidak ada pembaca yang perlu diubah.
-- =============================================================================


-- ── A. Inspeksi JTM / JTR ────────────────────────────────────────────────────
ALTER TABLE public.wo_inspeksi
  ADD COLUMN IF NOT EXISTS batal_alasan TEXT,
  ADD COLUMN IF NOT EXISTS batal_oleh   TEXT,
  ADD COLUMN IF NOT EXISTS batal_at     TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public._inspeksi_item_dikerjakan(p_item_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.wo_inspeksi_item i WHERE i.id = p_item_id AND i.status = 'Selesai')
      OR EXISTS (SELECT 1 FROM public.inspeksi_jtm m WHERE m.wo_item_id = p_item_id AND m.status <> 'Dibatalkan')
      OR EXISTS (SELECT 1 FROM public.inspeksi_jtr r WHERE r.wo_item_id = p_item_id AND r.status <> 'Dibatalkan');
$fn$;

-- NULL = berhasil; selain itu sebab tidak bisa. Tanpa penjaga hak.
CREATE OR REPLACE FUNCTION public._keluarkan_inspeksi_item(p_item_id UUID, p_alasan TEXT, p_oleh TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE it RECORD;
BEGIN
  SELECT * INTO it FROM public.wo_inspeksi_item WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'Item WO tidak ditemukan.'; END IF;
  IF it.status = 'Dibatalkan' THEN RETURN 'Sudah dikeluarkan sebelumnya.'; END IF;
  IF public._inspeksi_item_dikerjakan(p_item_id) THEN
    RETURN 'Sudah diinspeksi regu — tidak bisa dikeluarkan dari WO.';
  END IF;

  UPDATE public.wo_inspeksi_item SET status = 'Dibatalkan', catatan = p_alasan, updated_at = now()
  WHERE id = p_item_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_inspeksi_item', it.objek_nama, it.ulp, 'dibatalkan', to_jsonb(it.status),
          to_jsonb(p_alasan), 'sunting_admin', auth.uid(), p_oleh);
  RETURN NULL;
END $fn$;
REVOKE EXECUTE ON FUNCTION public._keluarkan_inspeksi_item(UUID, TEXT, TEXT) FROM PUBLIC, authenticated;

-- Satu item (tombol lama) — kini ikut penjaga "sudah dikerjakan".
CREATE OR REPLACE FUNCTION public.batalkan_wo_inspeksi_item(p_item_id UUID, p_alasan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE unit TEXT; sebab TEXT;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi.'; END IF;
  SELECT ulp INTO unit FROM public.wo_inspeksi_item WHERE id = p_item_id;
  IF unit IS NULL THEN RAISE EXCEPTION 'Item WO tidak ditemukan'; END IF;
  PERFORM public.wajib_boleh_ulp(unit);
  sebab := public._keluarkan_inspeksi_item(p_item_id, btrim(p_alasan), p_oleh);
  IF sebab IS NOT NULL THEN RAISE EXCEPTION '%', sebab; END IF;
END $fn$;
GRANT EXECUTE ON FUNCTION public.batalkan_wo_inspeksi_item(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.keluarkan_wo_inspeksi_banyak(p_item_id UUID[], p_alasan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it       RECORD;
  sebab    TEXT;
  n        INT := 0;
  dilewati JSONB := '[]'::jsonb;
BEGIN
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi.'; END IF;
  FOR it IN SELECT id, ulp, objek_nama FROM public.wo_inspeksi_item WHERE id = ANY(p_item_id) LOOP
    PERFORM public.wajib_boleh_ulp(it.ulp);
    sebab := public._keluarkan_inspeksi_item(it.id, btrim(p_alasan), p_oleh);
    IF sebab IS NULL THEN n := n + 1;
    ELSE dilewati := dilewati || jsonb_build_object('objek', it.objek_nama, 'sebab', sebab);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('keluar', n, 'dilewati', dilewati);
END $fn$;
GRANT EXECUTE ON FUNCTION public.keluarkan_wo_inspeksi_banyak(UUID[], TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.batalkan_wo_inspeksi(p_wo_id UUID, p_alasan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  w     RECORD;
  it    RECORD;
  jalan INT;
  n     INT := 0;
BEGIN
  SELECT * INTO w FROM public.wo_inspeksi WHERE id = p_wo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WO tidak ditemukan'; END IF;
  PERFORM public.wajib_boleh_ulp(w.ulp);
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan WO wajib diisi.'; END IF;
  IF w.status <> 'Terbit' THEN RAISE EXCEPTION 'WO "%" sudah berstatus %.', w.nama, w.status; END IF;

  SELECT count(*) INTO jalan FROM public.wo_inspeksi_item i
  WHERE i.wo_id = p_wo_id AND i.status <> 'Dibatalkan' AND public._inspeksi_item_dikerjakan(i.id);
  IF jalan > 0 THEN
    RAISE EXCEPTION 'WO "%" tidak bisa dibatalkan: % objek sudah diinspeksi regu. Keluarkan saja yang belum diinspeksi.', w.nama, jalan;
  END IF;

  FOR it IN SELECT id FROM public.wo_inspeksi_item WHERE wo_id = p_wo_id AND status = 'Terbuka' LOOP
    PERFORM public._keluarkan_inspeksi_item(it.id, 'WO dibatalkan: ' || btrim(p_alasan), p_oleh);
    n := n + 1;
  END LOOP;

  UPDATE public.wo_inspeksi
  SET status = 'Dibatalkan', batal_alasan = btrim(p_alasan), batal_oleh = p_oleh, batal_at = now()
  WHERE id = p_wo_id;

  INSERT INTO public.master_audit
    (entitas, entitas_kode, ulp, field, nilai_lama, nilai_baru, aksi, oleh_uid, oleh_nama)
  VALUES ('wo_inspeksi', w.nama, w.ulp, 'dibatalkan', to_jsonb(w.status),
          jsonb_build_object('alasan', btrim(p_alasan), 'item', n), 'sunting_admin', auth.uid(), p_oleh);
  RETURN n;
END $fn$;
GRANT EXECUTE ON FUNCTION public.batalkan_wo_inspeksi(UUID, TEXT, TEXT) TO authenticated;


-- ── B. Pemeliharaan Gardu & Pengukuran: arsip pembatalan ─────────────────────
CREATE TABLE IF NOT EXISTS public.wo_batal_arsip (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modul      TEXT NOT NULL CHECK (modul IN ('hargardu', 'pengukuran')),
  jenis      TEXT NOT NULL CHECK (jenis IN ('wo', 'item')),
  wo_id      UUID NOT NULL,
  ulp        TEXT NOT NULL,
  tahun      INT  NOT NULL,
  bulan      INT  NOT NULL,
  gardu_kode TEXT,             -- NULL untuk baris 'wo'
  isi        JSONB NOT NULL,   -- baris aslinya, utuh
  alasan     TEXT NOT NULL,
  oleh       TEXT,
  oleh_uid   UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wo_batal_arsip_idx ON public.wo_batal_arsip (modul, ulp, tahun, bulan);
ALTER TABLE public.wo_batal_arsip ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wo_batal_arsip_baca ON public.wo_batal_arsip;
CREATE POLICY wo_batal_arsip_baca ON public.wo_batal_arsip FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.wo_batal_arsip TO authenticated;
-- Penulisan HANYA lewat fungsi di bawah.

-- Gardu WO ini sudah dikerjakan? (realisasi sudah tersambung)
CREATE OR REPLACE FUNCTION public._wo_gardu_dikerjakan(p_modul TEXT, p_item_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT CASE p_modul
    WHEN 'hargardu'   THEN EXISTS (SELECT 1 FROM public.wo_hargardu_realisasi r WHERE r.id = p_item_id AND r.pemeliharaan_id IS NOT NULL)
    WHEN 'pengukuran' THEN EXISTS (SELECT 1 FROM public.wo_pengukuran_realisasi r WHERE r.id = p_item_id AND r.pengukuran_id IS NOT NULL)
  END;
$fn$;

CREATE OR REPLACE FUNCTION public._keluarkan_wo_gardu(p_modul TEXT, p_item_id UUID, p_alasan TEXT, p_oleh TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  baris JSONB;
  w     RECORD;
  kode  TEXT;
BEGIN
  IF p_modul = 'hargardu' THEN
    SELECT to_jsonb(i), i.gardu_kode INTO baris, kode FROM public.wo_hargardu_item i WHERE i.id = p_item_id;
    SELECT h.id, h.ulp, h.tahun, h.bulan INTO w FROM public.wo_hargardu h WHERE h.id = (baris->>'wo_id')::uuid;
  ELSE
    SELECT to_jsonb(i), i.kode_gardu INTO baris, kode FROM public.wo_pengukuran_item i WHERE i.id = p_item_id;
    SELECT h.id, h.ulp, h.tahun, h.bulan INTO w FROM public.wo_pengukuran h WHERE h.id = (baris->>'wo_id')::uuid;
  END IF;
  IF baris IS NULL THEN RETURN 'Baris WO tidak ditemukan (mungkin sudah dikeluarkan).'; END IF;
  IF public._wo_gardu_dikerjakan(p_modul, p_item_id) THEN
    RETURN 'Sudah dikerjakan regu — tidak bisa dikeluarkan dari WO.';
  END IF;

  INSERT INTO public.wo_batal_arsip (modul, jenis, wo_id, ulp, tahun, bulan, gardu_kode, isi, alasan, oleh, oleh_uid)
  VALUES (p_modul, 'item', w.id, w.ulp, w.tahun, w.bulan, kode, baris, p_alasan, p_oleh, auth.uid());

  IF p_modul = 'hargardu' THEN DELETE FROM public.wo_hargardu_item WHERE id = p_item_id;
  ELSE DELETE FROM public.wo_pengukuran_item WHERE id = p_item_id;
  END IF;
  RETURN NULL;
END $fn$;
REVOKE EXECUTE ON FUNCTION public._keluarkan_wo_gardu(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.keluarkan_wo_gardu_banyak(p_modul TEXT, p_item_id UUID[], p_alasan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it       RECORD;
  sebab    TEXT;
  n        INT := 0;
  dilewati JSONB := '[]'::jsonb;
BEGIN
  IF p_modul NOT IN ('hargardu', 'pengukuran') THEN RAISE EXCEPTION 'Modul % tidak dikenal', p_modul; END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi.'; END IF;
  FOR it IN
    SELECT i.id, i.ulp, i.gardu_kode AS kode FROM public.wo_hargardu_item i WHERE p_modul = 'hargardu' AND i.id = ANY(p_item_id)
    UNION ALL
    SELECT i.id, i.ulp, i.kode_gardu FROM public.wo_pengukuran_item i WHERE p_modul = 'pengukuran' AND i.id = ANY(p_item_id)
  LOOP
    PERFORM public.wajib_boleh_ulp(it.ulp);
    sebab := public._keluarkan_wo_gardu(p_modul, it.id, btrim(p_alasan), p_oleh);
    IF sebab IS NULL THEN n := n + 1;
    ELSE dilewati := dilewati || jsonb_build_object('objek', it.kode, 'sebab', sebab);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('keluar', n, 'dilewati', dilewati);
END $fn$;
GRANT EXECUTE ON FUNCTION public.keluarkan_wo_gardu_banyak(TEXT, UUID[], TEXT, TEXT) TO authenticated;

-- Batalkan WO keseluruhan: seluruh baris + kepala WO ke arsip, lalu WO dilepas
-- (satu WO per ULP per bulan — sesudahnya bulan itu bisa diterbitkan ulang).
CREATE OR REPLACE FUNCTION public.batalkan_wo_gardu(p_modul TEXT, p_wo_id UUID, p_alasan TEXT, p_oleh TEXT DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  w     JSONB;
  it    RECORD;
  jalan INT;
  n     INT := 0;
BEGIN
  IF p_modul NOT IN ('hargardu', 'pengukuran') THEN RAISE EXCEPTION 'Modul % tidak dikenal', p_modul; END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN RAISE EXCEPTION 'Alasan pembatalan WO wajib diisi.'; END IF;
  IF p_modul = 'hargardu' THEN SELECT to_jsonb(h) INTO w FROM public.wo_hargardu h WHERE h.id = p_wo_id;
  ELSE SELECT to_jsonb(h) INTO w FROM public.wo_pengukuran h WHERE h.id = p_wo_id;
  END IF;
  IF w IS NULL THEN RAISE EXCEPTION 'WO tidak ditemukan'; END IF;
  PERFORM public.wajib_boleh_ulp(w->>'ulp');

  SELECT count(*) INTO jalan FROM (
    SELECT i.id FROM public.wo_hargardu_item i WHERE p_modul = 'hargardu' AND i.wo_id = p_wo_id
    UNION ALL
    SELECT i.id FROM public.wo_pengukuran_item i WHERE p_modul = 'pengukuran' AND i.wo_id = p_wo_id
  ) x WHERE public._wo_gardu_dikerjakan(p_modul, x.id);
  IF jalan > 0 THEN
    RAISE EXCEPTION 'WO % % tidak bisa dibatalkan: % gardu sudah dikerjakan regu. Keluarkan saja gardu yang belum dikerjakan.',
      w->>'ulp', to_char(make_date((w->>'tahun')::int, (w->>'bulan')::int, 1), 'MM-YYYY'), jalan;
  END IF;

  FOR it IN
    SELECT i.id FROM public.wo_hargardu_item i WHERE p_modul = 'hargardu' AND i.wo_id = p_wo_id
    UNION ALL
    SELECT i.id FROM public.wo_pengukuran_item i WHERE p_modul = 'pengukuran' AND i.wo_id = p_wo_id
  LOOP
    PERFORM public._keluarkan_wo_gardu(p_modul, it.id, 'WO dibatalkan: ' || btrim(p_alasan), p_oleh);
    n := n + 1;
  END LOOP;

  INSERT INTO public.wo_batal_arsip (modul, jenis, wo_id, ulp, tahun, bulan, isi, alasan, oleh, oleh_uid)
  VALUES (p_modul, 'wo', p_wo_id, w->>'ulp', (w->>'tahun')::int, (w->>'bulan')::int, w, btrim(p_alasan), p_oleh, auth.uid());

  IF p_modul = 'hargardu' THEN DELETE FROM public.wo_hargardu WHERE id = p_wo_id;
  ELSE DELETE FROM public.wo_pengukuran WHERE id = p_wo_id;
  END IF;
  RETURN n;
END $fn$;
GRANT EXECUTE ON FUNCTION public.batalkan_wo_gardu(TEXT, UUID, TEXT, TEXT) TO authenticated;


-- ── Periksa ──────────────────────────────────────────────────────────────────
--   SELECT modul, jenis, ulp, tahun, bulan, gardu_kode, alasan, oleh, created_at
--     FROM wo_batal_arsip ORDER BY created_at DESC;
--   SELECT jenis, nama, status, batal_alasan FROM wo_inspeksi WHERE status = 'Dibatalkan';
