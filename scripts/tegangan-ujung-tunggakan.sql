-- =============================================================================
-- Tegangan ujung tunggakan WO Pengukuran (18 Nov 2026). Idempoten.
-- Jalankan manual di Supabase SQL Editor.
--
-- Keputusan user 18 Nov 2026:
--   • Gardu WO bulan M yang BEBANNYA sudah diukur di bulan M tetapi tegangan
--     ujungnya belum → di bulan M+1 tinggal mengukur tegangan ujung. Realisasi
--     = bulan tuntas (M+1), angka bulan M tidak berubah (_pengukuran_bulan
--     sudah memakai GREATEST(beban, ujung) sejak 3 Nov).
--   • Hanya bulan berikutnya. Lewat dari itu → ukur ulang semuanya.
--   • Gardu yang juga ada di WO bulan M+1 = WO biasa: tunggakannya tetap tampil,
--     tetapi beban dan tegangan ujung diukur ulang untuk WO bulan itu.
--     (Rekap _wo_pengukuran_tunggakan sudah tidak menghitung tunggakan gardu
--     yang terbit lagi; tanpa larangan ini gardu itu terhitung dua kali.)
--
-- Sebelumnya kirim_tegangan_ujung menolak semua tegangan ujung yang tidak
-- sebulan dengan bebannya (keputusan 27 Sep 2026).
--
-- Ditambal pada definisi HIDUP kirim_tegangan_ujung: satu potongan diganti.
-- Potongan tidak ketemu tepat sekali → berhenti dengan galat, tidak ada yang
-- berubah. Sudah ditambal → dilewati.
-- =============================================================================

-- Boleh-tidaknya tegangan ujung bulan berikutnya untuk beban p_pid. Melempar
-- galat yang bisa dibaca regu; diam = boleh.
CREATE OR REPLACE FUNCTION public._tegangan_ujung_tunggakan(
  p_pid TEXT, p_kode TEXT, p_ulp TEXT, p_beban DATE, p_tu DATE)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Beban ini realisasi WO bulannya sendiri (view: pengukuran pertama gardu itu
  -- di bulan WO) → itulah tunggakan yang tinggal tegangan ujung.
  IF NOT EXISTS (
    SELECT 1 FROM public.wo_pengukuran_realisasi r
    WHERE upper(r.kode_gardu) = upper(p_kode) AND upper(r.ulp) = upper(p_ulp)
      AND r.pengukuran_id::text = p_pid
  ) THEN
    RAISE EXCEPTION 'Beban % tanggal % bukan pengukuran WO bulan itu — tegangan ujungnya harus di bulan yang sama. Ukur ulang beban dan tegangan ujungnya bulan ini.',
      upper(p_kode), to_char(p_beban, 'DD-MM-YYYY');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.wo_pengukuran_item i
    JOIN public.wo_pengukuran w ON w.id = i.wo_id
    WHERE upper(i.kode_gardu) = upper(p_kode) AND upper(i.ulp) = upper(p_ulp)
      AND date_trunc('month', w.tgl_wo) = date_trunc('month', p_tu)
  ) THEN
    RAISE EXCEPTION 'Gardu % juga ada di WO Pengukuran bulan ini — ukur ulang beban dan tegangan ujungnya untuk WO bulan ini.',
      upper(p_kode);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._tegangan_ujung_tunggakan(TEXT, TEXT, TEXT, DATE, DATE) FROM PUBLIC, anon;

DO $do$
DECLARE
  def   TEXT := pg_get_functiondef('public.kirim_tegangan_ujung(jsonb)'::regprocedure);
  pola  TEXT := $re$IF date_trunc\('month', v_tgl\) <> date_trunc\('month', m\.tanggal_pengukuran::date\) OR v_tgl < m\.tanggal_pengukuran::date THEN(\s+)RAISE EXCEPTION 'Tegangan ujung jurusan % diukur %, sedangkan bebannya %\. Keduanya harus di bulan yang sama, dan ujung tidak mendahului beban\.',\s+v_jur, to_char\(v_tgl, 'DD-MM-YYYY'\), to_char\(m\.tanggal_pengukuran::date, 'DD-MM-YYYY'\);\s+END IF;$re$;
  ganti TEXT := $g$IF v_tgl < m.tanggal_pengukuran::date THEN\1RAISE EXCEPTION 'Tegangan ujung jurusan % diukur %, sebelum bebannya (%). Ujung tidak boleh mendahului beban.',
        v_jur, to_char(v_tgl, 'DD-MM-YYYY'), to_char(m.tanggal_pengukuran::date, 'DD-MM-YYYY');
    END IF;
    -- Tunggakan WO (tegangan-ujung-tunggakan.sql): boleh menyusul bulan berikutnya saja.
    IF date_trunc('month', v_tgl) <> date_trunc('month', m.tanggal_pengukuran::date) THEN
      IF date_trunc('month', v_tgl) <> date_trunc('month', m.tanggal_pengukuran::date) + INTERVAL '1 month' THEN
        RAISE EXCEPTION 'Tegangan ujung jurusan % diukur %, bebannya %. Tegangan ujung paling lambat bulan berikutnya — ukur ulang beban dan tegangan ujungnya bulan ini.',
          v_jur, to_char(v_tgl, 'DD-MM-YYYY'), to_char(m.tanggal_pengukuran::date, 'DD-MM-YYYY');
      END IF;
      PERFORM public._tegangan_ujung_tunggakan(v_pid, m.no_gardu, m.petugas_unit, m.tanggal_pengukuran::date, v_tgl);
    END IF;$g$;
  n     INT;
BEGIN
  IF position('tegangan-ujung-tunggakan.sql' IN def) > 0 THEN
    RAISE NOTICE 'kirim_tegangan_ujung sudah ditambal — dilewati.';
    RETURN;
  END IF;
  SELECT count(*) INTO n FROM regexp_matches(def, pola, 'g');
  IF n <> 1 THEN
    RAISE EXCEPTION 'Potongan aturan sebulan dengan beban ditemukan % kali (harus 1) — tidak ada yang diubah.', n;
  END IF;
  EXECUTE regexp_replace(def, pola, ganti);
  RAISE NOTICE 'kirim_tegangan_ujung ditambal.';
END $do$;

-- Periksa: gardu WO bulan lalu yang tinggal tegangan ujung (per ULP)
-- SELECT ulp, count(*) FROM wo_pengukuran_realisasi
-- WHERE tgl_wo >= date_trunc('month', now() - INTERVAL '1 month') AND tgl_wo < date_trunc('month', now())
--   AND menunggu_tegangan_ujung GROUP BY 1;
