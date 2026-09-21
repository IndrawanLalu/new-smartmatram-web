# Rencana — Kunci titik pengukuran 50 m + persetujuan pengukuran

Status: **rancangan, belum dikerjakan.**
Tanggal: 22 September 2026

## 0. Yang diminta

1. Kunci pengukuran gardu dalam **radius 50 m** dari titik masternya.
2. Fitur **perbarui titik gardu** dari lapangan, yang mengubah master.
3. Pengukuran yang titiknya diperbarui **masuk tab Persetujuan**, dan **belum
   terhitung realisasi** sampai disetujui.
4. Tab Persetujuan juga memuat yang **beda kVA** dan yang **anomali hasil ukur**.

---

## 1. ⚠ Keadaan data hari ini mengubah bentuk fiturnya

Diperiksa langsung 22 Sep 2026. Angka-angka ini yang menentukan, bukan dugaan:

| | |
|---|---|
| Gardu di master | 2.536 |
| **Gardu TANPA koordinat** | **444** (17,5%) |
| Pengukuran yang membawa titik petugas | 250 dari 2.097 |

Dari **250 pengukuran bertitik**:

| | |
|---|---|
| Gardunya tidak punya koordinat master | **153** (61%) |
| Bisa dibandingkan | 97 |
| — dalam 50 m | 67 |
| — **di luar 50 m** | **30** (31%) |
| Beda kVA master vs ukur | 7 dari 97 |

Yang terjauh: **CN026 14,3 km · CN046 14,2 km · CN204 11,8 km · TJ017 6,7 km**.

**Yang 14 km itu bukan "melenceng".** Itu koordinat master yang salah total,
atau kode gardu yang tertukar. Membetulkannya dengan menekan "perbarui titik"
di tempat petugas berdiri adalah tindakan yang benar — tapi hanya kalau yang
dia datangi memang gardu yang dimaksud.

### Akibatnya pada rancangan

Kunci 50 m yang dipasang hari ini **akan menghentikan 61% pekerjaan** (master
tanpa koordinat) ditambah **31% sisanya** (master meleset). Jalur "perbarui
titik" karena itu **bukan pelengkap — dia jalur utama selama berbulan-bulan
pertama.** Harus dirancang untuk dipakai setiap hari, bukan sesekali.

---

## 2. Sebagian besar sudah ada, tinggal disambung

`master_usulan` (dibuat di `scripts/master-usulan-schema.sql`) sudah persis
berbentuk yang dibutuhkan, lengkap dengan alasannya:

```
entitas · entitas_kode · ulp · field · nilai_lama · nilai_baru
bukti_lat · bukti_lng · bukti_akurasi · bukti_selisih · bukti_foto
sumber_modul · sumber_id · diterapkan_langsung · status
```

Dan pembedaan yang sudah tertulis di sana **tepat untuk kasus ini**:

| | |
|---|---|
| `diterapkan_langsung = true` | Master berubah SEKARANG, diverifikasi belakangan. Untuk **koordinat**: petugas berdiri di sana, ketelitian GPS ikut tercatat, dan salah titik tidak memicu tindakan apa pun. |
| `diterapkan_langsung = false` | Master TIDAK berubah sampai disetujui. Untuk **kVA**: salah di situ menggerakkan orang dan barang. |

Fungsi `koreksi_titik_gardu()` dan `putuskan_usulan()` juga **sudah ada**.

**Jadi yang benar-benar baru cuma tiga hal**: penjaga radius di HP, penandaan
"tertahan" pada pengukuran, dan tab Persetujuan di web.

---

## 3. Alur di HP

```
Petugas buka gardu untuk diukur
        ↓
Ambil titik GPS
        ↓
┌─ master TIDAK punya koordinat ──────────────────────────┐
│  Tidak ada yang bisa dikunci. Titik petugas DIPAKAI      │
│  sebagai koordinat master (usulan, diterapkan langsung). │
│  Pengukurannya tertahan sampai disetujui.                │
└──────────────────────────────────────────────────────────┘
        ↓
┌─ jarak ≤ 50 m ──────────────────────────────────────────┐
│  Lanjut seperti biasa. Tidak ada yang berubah.           │
└──────────────────────────────────────────────────────────┘
        ↓
┌─ jarak > 50 m ──────────────────────────────────────────┐
│  Simpan DIHALANGI. Dua jalan keluar, dipilih petugas:    │
│                                                          │
│  a. "Saya salah gardu"  → kembali, tidak ada yang dicatat│
│  b. "Titik masternya salah" → wajib foto gardunya +      │
│     catatan; titik master diperbarui, pengukuran tertahan│
└──────────────────────────────────────────────────────────┘
```

**Foto wajib pada jalur (b), dan itu bukan kerewelan.** Selisih 14 km tidak
bisa dibedakan dari "petugas salah gardu" tanpa melihat papan namanya. Foto
adalah satu-satunya yang membedakan koreksi dari kekeliruan.

**Ketelitian GPS ikut disimpan.** Titik ber-akurasi 80 m tidak boleh
memindahkan master sejauh 60 m — di layar persetujuan, angka itu yang
memberi tahu admin bahwa selisihnya mungkin cuma derau alat.

### 3.1 Petugas harus TAHU keadaannya, bukan cuma dihalangi

Bapak 22 Sep: *"pastikan saat user melakukan pengukuran, sistem akan memberi
tahu user bahwa user sudah berada di gardu yang tepat, diberikan jarak dari
master jika ada titik, jika belum ada akan di infokan juga. sebelum simpan juga
akan ada modal konfirmasi bahwa titik kordinat berbeda dan akan di verifikasi
oleh admin ULP. semacam itu supaya user yakin."*

Ini bukan hiasan. Penjaga yang cuma berkata "tidak bisa" membuat petugas
berdiri di lapangan menebak apa yang salah — dan yang menebak akan mencoba
lagi, mematikan aplikasi, atau menuliskan angka asal supaya bisa lewat.

**Pita keadaan, terlihat SEJAK layar dibuka** — bukan baru muncul saat Simpan
ditekan:

```
✅  Anda di gardu yang tepat            12 m dari titik master
⚠️  Jauh dari titik master             340 m — periksa apakah ini gardunya
ℹ️  Gardu ini belum punya titik        titik Anda akan jadi titik masternya
⏳  Mencari sinyal GPS…                 ketelitian 45 m
```

Angka jaraknya **selalu disebut**, tidak hanya saat melanggar. Petugas yang
melihat "12 m" tahu sistemnya bekerja dan titiknya benar; yang cuma melihat
layar diam tidak tahu apakah sistemnya memeriksa atau tidak.

**Modal konfirmasi sebelum simpan**, berbunyi apa adanya:

```
Titik gardu ini akan diperbarui

Titik master sekarang berjarak 340 m dari tempat Anda berdiri.
Kalau Anda yakin ini gardu yang benar, titiknya akan diperbarui
memakai titik Anda.

⚠ Pengukuran ini menunggu persetujuan admin ULP dulu, dan BELUM
  dihitung sebagai realisasi sampai disetujui.

[ Batal, saya periksa lagi ]   [ Ya, perbarui titiknya ]
```

Kalimat "belum dihitung sebagai realisasi" **wajib ada**. Petugas berhak tahu
bahwa pekerjaannya belum masuk hitungan — kalau baru ketahuan di akhir bulan
saat capaiannya kurang, yang rusak bukan cuma angkanya.

---

## 4. Tab Persetujuan di `/admin/pengukuran-gardu`

Tiga kelompok, satu tab:

| Kelompok | Sebab | Master berubah? |
|---|---|---|
| **Titik diperbarui** | jarak > 50 m, atau master belum punya titik | Ya, langsung — ditolak = dikembalikan |
| **Beda kVA** | `kva_trafo` ukur ≠ `gardu.daya` | Tidak sampai disetujui |
| **Anomali hasil ukur** | `detectAnomali()` — sudah ada di `lib/anomaliGardu.ts`, memakai ambang per ULP yang sudah bisa disetel | Tidak ada master yang berubah |

Tiap baris: gardu, petugas, tanggal, sebab, bukti (foto + titik + selisih +
akurasi), tombol **Terima / Kembalikan** dengan alasan wajib saat dikembalikan.

---

## 5. Keputusan Bapak, 22 Sep 2026

### 5.1 Yang menahan realisasi: TITIK dan kVA. Anomali TIDAK.

| Sebab | Realisasi |
|---|---|
| Titik diperbarui | **tertahan** sampai disetujui |
| Beda kVA | **tertahan** sampai disetujui |
| Anomali hasil ukur | **tetap dihitung** — cuma ditandai untuk diperiksa |

Alasannya: gardu berbeban 120% itu pengukuran yang BENAR dan sudah dikerjakan.
Menahan realisasinya berarti regu kehilangan capaian justru saat menemukan hal
yang paling penting dilaporkan.

**Ini jatuh dengan sendirinya dari bentuk datanya**, dan itu kebetulan yang
enak: titik dan kVA sama-sama melahirkan baris `master_usulan` (ada yang harus
diputuskan tentang MASTER), sedangkan anomali tidak melahirkan apa pun —
tidak ada satu pun nilai master yang perlu diubah. Jadi aturannya cukup
berbunyi *"tertahan selama ada usulan yang menunggu"*, bukan daftar sebab yang
harus dirawat terpisah.

### 5.2 Radius bisa disetel PER ULP

Ikut pola `anomali_settings` yang sudah ada — satu baris per ULP, bawaan 50 m.
Gardu di gang sempit kota berbeda dengan gardu di tepi jalan Bayan.

### 5.3 Master tanpa koordinat: titik LANGSUNG dipakai, tapi tetap diverifikasi

Bapak: *"ingat admin yang tetap verifikasi dan ditunjukkan titik sebelum dan
sesudahnya saat verifikasi di web."*

Jadi 444 gardu itu terisi cepat lewat pengukuran biasa, tapi tidak satu pun
lolos tanpa dilihat orang. Dan layar persetujuan **wajib memperlihatkan titik
lama dan titik baru berdampingan di peta** — angka lintang-bujur tidak memberi
tahu apa pun tentang apakah perpindahan 14 km itu masuk akal; peta memberi tahu.

Untuk gardu yang memang belum punya titik, sisi "sebelum" **dikatakan kosong
apa adanya**, bukan ditaruh penanda di tengah laut.

---

## 6. Urutan kerja (setelah tiga pertanyaan di atas dijawab)

| Fase | Isi | Butuh | Keadaan |
|---|---|---|---|
| **1** | SQL: penahan realisasi + koreksi titik + usulan kVA + radius per ULP | SQL Editor | **selesai** 22 Sep |
| **2** | Web: tab Persetujuan (tiga kelompok) + peta sebelum/sesudah | deploy | **selesai** 22 Sep |
| **3** | HP: pita keadaan + jarak selalu terlihat + modal konfirmasi + foto wajib | OTA |
| **4** | Pemantauan: berapa persen gardu sudah bertitik, per ULP | deploy |

Fase 1–2 berguna lebih dulu: yang 7 beda kVA dan anomali yang sudah ada bisa
langsung diperiksa, tanpa menunggu HP.
