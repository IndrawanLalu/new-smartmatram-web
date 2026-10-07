# Rencana: Batalkan segmen / ulangi inspeksi JTM dari HP

*7 Oktober 2026. Status: **DISETUJUI USER, DIKERJAKAN.** SQL `scripts/jtm-batal-hp.sql`
(diuji PGlite: 24 pemeriksaan lulus, idempoten). HP: tombol 🗑 di kepala layar segmen.*

## Keadaan sebelumnya
- HP hanya bisa membatalkan **rintisan terbuka** (lembar Rintis). Segmen yang rintisannya
  sudah ditutup tidak punya tombol, padahal server mengizinkan.
- Segmen yang punya segmen sambungan sesudahnya ditolak (memutus rantai).
- Siapa pun se-ULP boleh membatalkan, termasuk yang sudah menunggu persetujuan.

## Keputusan user
| # | Keputusan |
|---|---|
| 1 | Segmen yang sedang diinspeksi boleh dibatalkan. Kalau masuk **WO**: segmennya tetap, tiang yang dititik di-reset, segmen kembali ke WO "belum dikerjakan" |
| 2 | Batalkan **berantai** (segmen ini + segmen sesudahnya) — dengan peringatan jelas |
| 3 | Yang boleh: **perintis** (batalkan) / petugas inspeksinya (ulangi), dan **admin** ULP / UP3 |
| 4 | Sudah dikirim (menunggu persetujuan) → **admin saja**. Sudah disetujui → tidak dari HP |

## Rancangan
Satu tombol di layar segmen; server memilih jalannya (`_jtm_rencana_batal`, satu tempat aturan):

| Jalan | Kapan | Akibat |
|---|---|---|
| **Batalkan segmen** | hasil rintis, belum WO, belum pernah disetujui | segmen + segmen sambungannya nonaktif, tiangnya dibatalkan, nama dilepas — satu transaksi, dari ujung ke atas |
| **Ulangi inspeksi** | masuk WO / segmen master / pernah disetujui | inspeksi tier itu Dibatalkan, tiang yang **lahir di inspeksi itu** dibatalkan, item WO tetap Terbuka |

- Pratinjau (`pratinjau_batal_jtm`) dulu: HP menampilkan daftar segmen yang ikut, jumlah tiang,
  dan perintis tiap segmen. Eksekusi (`batalkan_jtm_hp`) menghitung ulang aturannya.
- "Orang yang sama" = akun **dan** nama petugas sama (satu akun bisa dipakai bergantian).
- Tiang tidak menyimpan inspeksi asalnya: "lahir di inspeksi ini" = hanya milik segmen ini,
  dibuat sesudah inspeksi dimulai, tidak dinilai inspeksi lain yang masih hidup.
- `batalkan_segmen_rintisan` (lembar Rintis, HP lama) memakai aturan yang sama, satu segmen saja.

## Urutan
SQL (`jtm-batal-hp.sql`, sesudah `wo-jtm-tier.sql`) → OTA HP.
