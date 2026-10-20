-- ════════════════════════════════════════════════════════════════════════════
-- Analisis JTR — F3 Rencana perbaikan (20 Okt 2026). Jalankan SESUDAH
-- analisis-jtr.sql. Aman diulang.
--
-- Rencana (pemerataan / ganti kabel / tambah jurusan / sisip gardu / naik
-- daya) dihitung di web (`_lib/rencanaJtr.ts`) dari gawang per jurusan. Di sini
-- hanya: dua batas baru di Pengaturan, dan view gawang berisi tarikan SR +
-- tanda percabangan tiap tiang.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.jtr_analisis_pengaturan
  ADD COLUMN IF NOT EXISTS batas_kabel_baru_m NUMERIC NOT NULL DEFAULT 500 CHECK (batas_kabel_baru_m > 0),
  ADD COLUMN IF NOT EXISTS batas_trafo_pct    NUMERIC NOT NULL DEFAULT 80  CHECK (batas_trafo_pct > 0);

-- Satu gawang per tiang per gardu+jurusan — pemilihan SAMA dengan `gw` di
-- analisis_jtr_jurusan, supaya panjang & lintasan di web cocok dengan view itu.
CREATE OR REPLACE VIEW public.analisis_jtr_gawang
WITH (security_invoker = true) AS
SELECT DISTINCT ON (upper(k.gardu_kode), k.jurusan, k.tiang_id)
       upper(k.gardu_kode) AS gardu_kode, k.jurusan, k.tiang_id, k.kode, k.hulu_id,
       COALESCE(k.panjang_m, 0) AS panjang_m, k.jenis, k.ukuran,
       COALESCE(t.tarikan_sr, 0) AS tarikan_sr,
       COALESCE(t.percabangan, false) AS percabangan
FROM public.tiang_gawang_kabel k
LEFT JOIN public.tiang t ON t.id = k.tiang_id
WHERE k.jurusan IS NOT NULL
ORDER BY upper(k.gardu_kode), k.jurusan, k.tiang_id, k.tersambung DESC, k.panjang_m;

GRANT SELECT ON public.analisis_jtr_gawang TO authenticated;
