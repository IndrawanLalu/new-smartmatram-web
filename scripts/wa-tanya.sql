-- ═══════════════════════════════════════════════════════════════════════════
-- Tanya Jawab WA (@smart) — T1 (28 Okt 2026). Rencana: rencana-tanya-jawab-wa.md
--
-- Bot WA memahami kalimat biasa TANPA AI: kata kunci per fungsi + kamus
-- sinonim, diatur dari web. Fungsi jawabannya (ambil data + susun balasan) ada
-- di kode (lib/wa/tanya/fungsi). Baris fungsi, kata kunci, dan contoh bawaan
-- diisi SENDIRI oleh server saat fungsi baru pertama kali terlihat — skrip ini
-- hanya membuat tabel + kamus awal.
--
-- Dibaca semua akun; diubah UP3 saja. Riwayat ditulis server (service role).
-- Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.wa_tanya_fungsi (
  kode        TEXT PRIMARY KEY,
  nama        TEXT NOT NULL,
  aktif       BOOLEAN NOT NULL DEFAULT true,
  ambang      NUMERIC NOT NULL DEFAULT 1 CHECK (ambang > 0),
  catatan     TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS public.wa_tanya_kata (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fungsi_kode  TEXT NOT NULL REFERENCES public.wa_tanya_fungsi(kode) ON UPDATE CASCADE ON DELETE CASCADE,
  kata         TEXT NOT NULL CHECK (kata = lower(btrim(kata)) AND kata <> ''),
  bobot        NUMERIC NOT NULL DEFAULT 1 CHECK (bobot > 0),
  UNIQUE (fungsi_kode, kata)
);

CREATE TABLE IF NOT EXISTS public.wa_tanya_kamus (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dari  TEXT NOT NULL UNIQUE CHECK (dari = lower(btrim(dari)) AND dari <> ''),
  jadi  TEXT NOT NULL CHECK (jadi = lower(btrim(jadi)))
);

CREATE TABLE IF NOT EXISTS public.wa_tanya_contoh (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fungsi_kode  TEXT NOT NULL REFERENCES public.wa_tanya_fungsi(kode) ON UPDATE CASCADE ON DELETE CASCADE,
  teks         TEXT NOT NULL CHECK (btrim(teks) <> ''),
  urutan       INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.wa_tanya_riwayat (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waktu        TIMESTAMPTZ NOT NULL DEFAULT now(),
  dari         TEXT,
  grup         TEXT,
  nama         TEXT,
  teks         TEXT NOT NULL,
  teks_rapi    TEXT,
  fungsi_kode  TEXT,
  saringan     JSONB,
  skor         NUMERIC,
  hasil        TEXT NOT NULL CHECK (hasil IN ('dijawab', 'tidak_dipahami', 'pilihan', 'galat')),
  ditangani    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS wa_tanya_riwayat_waktu ON public.wa_tanya_riwayat (waktu DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['wa_tanya_fungsi', 'wa_tanya_kata', 'wa_tanya_kamus', 'wa_tanya_contoh'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_baca', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_baca', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_ubah', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      || 'USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = ''UP3'')) '
      || 'WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = ''UP3''))',
      t || '_ubah', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- Riwayat: semua akun membaca; hanya UP3 menandai "ditangani". Baris ditulis server.
ALTER TABLE public.wa_tanya_riwayat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_tanya_riwayat_baca ON public.wa_tanya_riwayat;
CREATE POLICY wa_tanya_riwayat_baca ON public.wa_tanya_riwayat
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS wa_tanya_riwayat_ubah ON public.wa_tanya_riwayat;
CREATE POLICY wa_tanya_riwayat_ubah ON public.wa_tanya_riwayat
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'UP3'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'UP3'));
GRANT SELECT, UPDATE ON public.wa_tanya_riwayat TO authenticated;

-- ── Kamus awal (hanya bila masih kosong) ────────────────────────────────────
-- Singkatan yang biasa diketik di WA → bentuk baku yang dibaca pengurai.
INSERT INTO public.wa_tanya_kamus (dari, jadi)
SELECT v.dari, v.jadi
FROM (VALUES
  ('cakra', 'cakranegara'), ('ckr', 'cakranegara'), ('cakranegra', 'cakranegara'),
  ('amp', 'ampenan'), ('ampnan', 'ampenan'),
  ('grg', 'gerung'), ('tjg', 'tanjung'),
  ('bln', 'bulan'), ('bln ini', 'bulan ini'), ('bulan kemarin', 'bulan lalu'), ('bln lalu', 'bulan lalu'),
  ('kmrn', 'kemarin'), ('kemaren', 'kemarin'), ('kmarin', 'kemarin'),
  ('hr ini', 'hari ini'), ('hri ini', 'hari ini'), ('td', 'hari ini'), ('tadi', 'hari ini'),
  ('mgg', 'minggu'), ('mg ini', 'minggu ini'), ('pekan ini', 'minggu ini'), ('pekan lalu', 'minggu lalu'),
  ('thn', 'tahun'), ('thn ini', 'tahun ini'),
  ('trafo', 'gardu'), ('gd', 'gardu'), ('pny', 'penyulang'), ('feeder', 'penyulang')
) AS v(dari, jadi)
WHERE NOT EXISTS (SELECT 1 FROM public.wa_tanya_kamus);
