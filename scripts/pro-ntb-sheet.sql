-- ═══════════════════════════════════════════════════════════════════════════
-- PRO NTB — spreadsheet tiap ULP (8 Nov 2026), tahap 1 "Cek ke spreadsheet".
--
-- SMART HANYA MEMBACA tab WO (WO RABAS, WO HARJAR, …) lewat Sheets API kunci
-- baca, lalu membandingkannya dengan baris Copy to PRO NTB. Belum ada yang
-- ditulis ke spreadsheet.
-- Aman dijalankan ulang.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pro_ntb_sheet (
  ulp             TEXT PRIMARY KEY,
  spreadsheet_id  TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);
COMMENT ON TABLE public.pro_ntb_sheet IS
  'Spreadsheet PRO NTB tiap ULP (pro-ntb-sheet.sql). Tahap 1: hanya dibaca untuk Cek ke spreadsheet.';

ALTER TABLE public.pro_ntb_sheet ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pro_ntb_sheet_baca ON public.pro_ntb_sheet;
CREATE POLICY pro_ntb_sheet_baca ON public.pro_ntb_sheet FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pro_ntb_sheet_ubah ON public.pro_ntb_sheet;
CREATE POLICY pro_ntb_sheet_ubah ON public.pro_ntb_sheet FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()
                 AND (r.role = 'UP3' OR (r.role = 'admin' AND upper(COALESCE(r.unit, '')) = upper(pro_ntb_sheet.ulp)))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()
                 AND (r.role = 'UP3' OR (r.role = 'admin' AND upper(COALESCE(r.unit, '')) = upper(pro_ntb_sheet.ulp)))));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_ntb_sheet TO authenticated;

-- Isi awal: ULP Ampenan (link dari user 8 Nov 2026).
INSERT INTO public.pro_ntb_sheet (ulp, spreadsheet_id, updated_by)
VALUES ('AMPENAN', '1VcVYHEwVFS_yvJoT8mh3IF9AE0mMDJWOG-cWvP0482M', 'isi awal')
ON CONFLICT (ulp) DO NOTHING;
