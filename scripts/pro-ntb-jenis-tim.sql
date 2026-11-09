-- ═══════════════════════════════════════════════════════════════════════════
-- PRO NTB — NAMA TIM tetap per jenis + isian JENIS yang belum diatur (8 Nov 2026).
-- Nilai disalin PERSIS dari spreadsheet PRO NTB Ampenan (termasuk spasi di
-- belakang: dropdown UIW "INSPEKSI JTM TIER-2  " berspasi dua).
-- Hanya mengisi yang masih kosong — isian yang sudah diatur di web tetap.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pro_ntb_jenis ADD COLUMN IF NOT EXISTS nama_tim TEXT;
COMMENT ON COLUMN public.pro_ntb_jenis.nama_tim IS
  'NAMA TIM tetap untuk jenis ini di PRO NTB (mis. INSPEKSI GARDU 1). NULL = nama regu SMART / diketik.';

INSERT INTO public.pro_ntb_jenis (kunci, jenis_pekerjaan, nama_tim, updated_by) VALUES
  ('jtm',           'INSPEKSI JTM TIER-1 ',  'INSPEKSI JTM TIER 1', 'pro-ntb-jenis-tim.sql'),
  ('jtm2',          'INSPEKSI JTM TIER-2  ', 'INSPEKSI JTM TIER 2', 'pro-ntb-jenis-tim.sql'),
  ('igardu1',       'INSPEKSI GARDU TIER 1', 'INSPEKSI GARDU 1',    'pro-ntb-jenis-tim.sql'),
  ('igardu2',       'INSPEKSI GARDU TIER 2', 'INSPEKSI GARDU 2',    'pro-ntb-jenis-tim.sql'),
  ('penyeimbangan', 'PEMERATAAN BEBAN',      NULL,                  'pro-ntb-jenis-tim.sql')
ON CONFLICT (kunci) DO UPDATE SET
  jenis_pekerjaan = COALESCE(public.pro_ntb_jenis.jenis_pekerjaan, EXCLUDED.jenis_pekerjaan),
  nama_tim        = COALESCE(public.pro_ntb_jenis.nama_tim, EXCLUDED.nama_tim),
  updated_at      = now();

SELECT kunci, '[' || jenis_pekerjaan || ']' AS jenis, nama_tim FROM public.pro_ntb_jenis ORDER BY kunci;
