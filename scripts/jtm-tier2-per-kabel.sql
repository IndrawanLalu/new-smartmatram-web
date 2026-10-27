-- =============================================================================
-- Isian Tier 2 diisi TIAP KABEL, bukan hanya pemilik tiang (27 Okt 2026)
-- Jalankan SESUDAH jtm-tier2-malam.sql. Idempoten.
--
-- Masalah: keenam isian Tier 2 (Pemeriksaan malam) bawaannya milik = 'tiang'
-- — hanya penyulang pemilik batang yang mengisi, tersembunyi bagi penumpang.
-- Akibatnya di Tier 2 BATU DAWE, tiang milik PERUMNAS yang ditumpangi tidak
-- punya isian sama sekali dan tidak bisa dinilai / diselesaikan.
--
-- Keputusan user 27 Okt: Tier 2 hanya kondisi kabel & material, dan peralatan
-- milik masing-masing penyulang — inspeksi BATU DAWE menilai miliknya sendiri,
-- tidak memunculkan FCO PERUMNAS. Jadi isian Tier 2 = milik 'sirkit', disimpan
-- per kabel (`sirkit_segmen_id`), sama dengan isian kabel Tier 1
-- (jtm-underbuild-mvtic.sql).
--
-- HP membaca `milik` dari server — tidak perlu OTA.
-- =============================================================================

-- ── 1. Isian Tier 2 → tiap kabel ─────────────────────────────────────────────
UPDATE public.jtm_item_ref SET milik = 'sirkit', updated_at = now()
WHERE kode IN ('hasil_malam', 'titik_panas', 'suhu_titik_panas', 'suhu_pembanding', 'suara', 'flashover')
  AND milik <> 'sirkit';


-- ── 2. Jawaban lama → disimpan per kabel ─────────────────────────────────────
-- Sama dengan bagian 3 jtm-underbuild-mvtic.sql: tanpa ini jawaban lama (tanpa
-- kabel) dan baru (per kabel) terbaca sebagai dua keadaan yang berbeda di
-- `tiang_kondisi_terakhir`. Baris lama diisi segmen inspeksinya sendiri.
UPDATE public.inspeksi_jtm_periksa p
SET sirkit_segmen_id = m.segmen_id
FROM public.inspeksi_jtm_titik tk
JOIN public.inspeksi_jtm m ON m.id = tk.inspeksi_id
JOIN public.jtm_item_ref i ON true
WHERE tk.id = p.titik_id
  AND i.kode = p.item_kode
  AND i.milik = 'sirkit'
  AND i.tier = '2'
  AND p.sirkit_segmen_id IS NULL;


-- ── Sesudah dijalankan ───────────────────────────────────────────────────────
-- a. Isian Tier 2 aktif semuanya 'sirkit':
--      SELECT kode, milik FROM jtm_item_ref WHERE tier = '2' AND aktif ORDER BY urutan;
-- b. Tidak ada lagi jawaban Tier 2 tanpa kabel (harus 0):
--      SELECT count(*) FROM inspeksi_jtm_periksa p JOIN jtm_item_ref i ON i.kode = p.item_kode
--      WHERE i.milik = 'sirkit' AND p.sirkit_segmen_id IS NULL;
-- Lalu di HP: buka ulang segmen Tier 2 — tiang yang ditumpangi kini berisian.
