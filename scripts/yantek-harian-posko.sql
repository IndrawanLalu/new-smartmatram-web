-- =============================================================================
-- yantek_harian: kunci menjadi (tanggal, id_posko)
-- =============================================================================
-- Jalankan SESUDAH `yantek-harian.sql`. Aman diulang (langkah pemecahan hanya
-- jalan sekali, selama kolom id_posko belum ada).
--
-- ── BUG YANG DIPERBAIKI (24 Sep 2026) ───────────────────────────────────────
-- Kuncinya cuma `tanggal`, padahal setiap tarikan APKT = SATU POSKO. Menyimpan
-- tarikan Cakra untuk 1–24 Sep MENIMPA baris Ampenan tanggal yang sama —
-- dilaporkan user: "download Ampenan normal, lalu download Cakra, Ampenan
-- hilang". Berkas JSON lama (satu berkas per tanggal) punya cacat yang sama;
-- tidak ketahuan karena dulu yang ditarik hampir selalu satu posko saja.
--
-- Sesudah ini: satu baris = satu tanggal × satu posko. Menarik ulang satu ULP
-- hanya mengganti ULP itu.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'yantek_harian' AND column_name = 'id_posko'
  ) THEN
    -- Pecah baris lama per posko, berdasarkan `id_posko` di tiap baris APKT.
    CREATE TEMP TABLE yantek_pecah ON COMMIT DROP AS
    SELECT h.tanggal,
           COALESCE((e->>'id_posko')::int, 0) AS id_posko,
           max(h.label)                        AS label,
           jsonb_agg(e)                        AS rows,
           max(h.disimpan_at)                  AS disimpan_at,
           (array_agg(h.disimpan_oleh))[1]     AS disimpan_oleh
    FROM public.yantek_harian h
    CROSS JOIN LATERAL jsonb_array_elements(h.rows) e
    GROUP BY h.tanggal, COALESCE((e->>'id_posko')::int, 0);

    ALTER TABLE public.yantek_harian ADD COLUMN id_posko INT;
    DELETE FROM public.yantek_harian;
    ALTER TABLE public.yantek_harian DROP CONSTRAINT IF EXISTS yantek_harian_pkey;

    INSERT INTO public.yantek_harian (tanggal, id_posko, label, rows, disimpan_at, disimpan_oleh)
    SELECT tanggal, id_posko, label, rows, disimpan_at, disimpan_oleh FROM yantek_pecah;

    ALTER TABLE public.yantek_harian ALTER COLUMN id_posko SET NOT NULL;
    ALTER TABLE public.yantek_harian ADD PRIMARY KEY (tanggal, id_posko);
  END IF;
END $$;

COMMENT ON COLUMN public.yantek_harian.id_posko IS
  'Posko APKT (441501 Ampenan, 441101 Cakra, 441301 Tanjung, 441701 Gerung). Satu tarikan = satu posko; 0 = baris tanpa id_posko.';

-- Periksa — tiap tanggal kini bisa punya beberapa posko:
--   SELECT tanggal, id_posko, jumlah FROM yantek_harian
--   WHERE tanggal >= '2026-09-01' ORDER BY tanggal, id_posko;
