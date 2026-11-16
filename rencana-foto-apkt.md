# Rencana — Foto & Petugas Laporan Gangguan APKT (16 Nov 2026)

**Status:** disetujui user 16 Nov, DIBANGUN (scripts/apkt-foto.sql, pekerja/apktFoto.mjs,
app/admin/detail-gangguan/_components/FotoApkt.tsx). Laporan yang baru 1 tahap berfoto
diulang sampai 3 malam juga.

Tujuan: di Detail Gangguan APKT, tiap laporan **Selesai** menampilkan 1 foto
Dalam Pengerjaan + 1 foto Selesai dan petugas penutupnya. Dasar untuk tab
**Realisasi PS4** nanti (persentase laporan berfoto per petugas, lalu verifikasi
apakah fotonya masuk kriteria PS4).

## Keputusan user
| Hal | Keputusan |
|---|---|
| Laporan | semua, sejak **1 Nov 2026**; yang lama dibiarkan |
| Status | hanya `status_akhir = 'Selesai'` persis (bukan Selesai(PEMADAMAN …), Selesai(GANGGUAN SISTEM), Dibatalkan, Nyala Sementara) |
| Foto | 2 saja: 1 Dalam Pengerjaan + 1 Selesai |
| Petugas | `gangguan_transaksi[jenis='Selesai'].appuser.username` (mis. `hastadi.mulyadi`) |
| Jam otomatis | mulai **00.00 WITA** (jam selesai: usulan 06.00, bisa diubah lewat env) |
| Jeda | satu laporan ± tiap 20 detik — tidak membebani server PLN |
| Tombol manual | "Ambil foto" di form koreksi, langsung diproses kapan saja (untuk uji) |
| Simpan | berkas foto **2 bulan**; catatan (ada/tidak, petugas, verifikasi PS4) permanen |
| Unggah Excel ulang | tidak boleh galat, menghapus, atau menukar foto |

## Uji koneksi (dari dalam container pekerja, 16 Nov)
- `getGangguanFotoByNoLaporan` port 32269 → OK (G4426111600482: 2 Dalam Pengerjaan + 2 Selesai).
- Unduh foto port 32169 → 200 image/jpeg 35 KB. Sertifikat diterima, tanpa login.
- `getGangguanByNoLaporan` (petugas) port 32269 → OK. `data` = SATU objek (bukan
  larik); `gangguan_transaksi` berurutan Lapor → Penugasan Regu → (Cancel WO →
  Penugasan Regu) → Dalam Perjalanan → Dalam Pengerjaan → Nyala → Selesai.
  Petugas = transaksi `jenis = 'Selesai'` dengan id terbesar (G4426111600482 →
  `hastadi.mulyadi`; WO yang dibatalkan sebelumnya tidak ikut).

## 1. Database (`scripts/apkt-foto.sql`)
**`apkt_foto_laporan`** — satu baris per laporan, kunci `no_laporan`. TANPA foreign key
ke `apkt_gangguan`: unggah Excel (upsert `apkt_gangguan`) tidak pernah menyentuhnya.
- `no_laporan` PK, `tgl_lapor`
- `status`: `antre` · `ada_foto` · `tidak_ada_foto` · `gagal`
- `coba` (berapa kali dicoba), `pesan` (galat terakhir, kalimat yang bisa dibaca), `dicoba_at`
- `petugas` (username APKT)
- `minta_manual_at` — diisi tombol "Ambil foto"; pekerja mendahulukannya
- `ps4`: NULL (belum diverifikasi) · `ya` · `tidak`, + `ps4_oleh`, `ps4_at` — dipakai nanti

**`apkt_foto`** — paling banyak 2 baris per laporan, `UNIQUE (no_laporan, tahap)`.
- `tahap`: `pengerjaan` · `selesai`; `apkt_foto_id` (id foto dari APKT); `path` Storage; `ukuran`
- `path` = `apkt-foto/<no_laporan>/<tahap>-<apkt_foto_id>.jpg` → nama memuat
  nomor laporan, jadi tidak mungkin tertukar antarlaporan.
- Sesudah 2 bulan: berkas dihapus, `path` jadi NULL, baris tetap (bukti "pernah ada foto").

**Antrean** = RPC `apkt_foto_antrean(p_jumlah)`, diturunkan, bukan disalin:
`apkt_gangguan` tgl_lapor ≥ 2026-11-01 AND status_akhir = 'Selesai' AND
(belum punya baris · atau `tidak_ada_foto` dengan coba < 3 dan terakhir dicoba
bukan malam ini · atau `gagal` dengan coba < 5), manual didahulukan.
Laporan *Nyala Sementara* yang di unggahan berikutnya jadi *Selesai* otomatis ikut.

Bucket Storage `apkt-foto` (baru).

## 2. Pekerja homelab (`pekerja/apktFoto.mjs`, dipanggil dari `pekerja/index.mjs`)
- Tiap 30 detik: ada permintaan manual? → proses segera (kapan saja).
- Otomatis hanya pukul 00.00–06.00 WITA (`JAM_FOTO_APKT=0-6`), satu laporan per 20 detik.
- Per laporan, berurutan dengan jeda:
  1. query foto → ambil satu per tahap (id terkecil);
  2. unduh JPEG → unggah ke Storage (`upsert`, path di atas);
  3. query petugas (kolom seperlunya saja) → transaksi `jenis = 'Selesai'` terakhir;
  4. tulis `apkt_foto_laporan` + `apkt_foto` sekaligus.
- Tidak ada foto → `tidak_ada_foto`, dicoba lagi sampai 3 malam (petugas bisa
  mengunggah terlambat). Galat jaringan → `gagal` + pesan, dicoba lagi malam berikutnya.
- Sekali sehari pukul 06.00: hapus berkas yang tgl_lapor-nya lebih dari 2 bulan.
- APKT memutus koneksi (ECONNRESET) → berhenti malam itu, tidak dipaksa.

## 3. Web — form koreksi (`KoreksiModal.tsx`)
Bagian baru (nama menunggu persetujuan user):
- **Foto APKT**: dua kotak "Dalam Pengerjaan" · "Selesai" (klik = ukuran asli).
- **Petugas APKT**: username.
- Status: "Belum diambil" / "Tidak ada foto di APKT (dicoba 2×)" / galat kuning.
- Tombol **Ambil foto** → `minta_manual_at`; status berubah sendiri sesudah pekerja selesai.
- Status bukan "Selesai" → tulisan "Foto hanya diambil untuk laporan berstatus Selesai".

## 4. Pengaman unggah Excel ulang
- Data foto & petugas di tabel sendiri, kunci `no_laporan` → upsert Excel tidak menyentuhnya.
- Path memuat `no_laporan` + id foto APKT → tidak bisa tertukar.
- Laporan berstatus `ada_foto` tidak ditarik ulang.
- Diuji: unggah ulang Excel yang sama → foto tetap, jumlah baris tetap.

## Nanti (bukan bagian ini)
Tab **Realisasi PS4**: per petugas — laporan Selesai, berfoto, %, lalu verifikasi
foto masuk kriteria PS4 (kolom `ps4` sudah disiapkan). Verifikasi harus dalam
2 bulan, sebelum berkas fotonya terhapus.

## Urutan
SQL → push web + pekerja → user deploy homelab (web + pekerja) → uji tombol manual
satu laporan → biarkan jalan malam.
