# SMART-Mataram Next.js — Claude Context

## Project
Rewrite dari React+Vite+Firebase → Next.js 16 + Supabase.
Aplikasi monitoring aset jaringan distribusi listrik PLN ULP Ampenan/Mataram.

## Stack
- **Framework:** Next.js 16, App Router, TypeScript
- **Database & Auth:** Supabase (PostgreSQL + Supabase Auth)
- **Styling:** Tailwind CSS v4 (token di `@theme {}`, bukan `tailwind.config.js`)
- **Charts:** Recharts + Chart.js + react-chartjs-2 + chartjs-plugin-datalabels
- **State:** Zustand (ganti Redux) — pakai hanya kalau state perlu dishare antar komponen jauh
- **Maps:** Leaflet + React-Leaflet (wajib `dynamic import` + `ssr: false`)
- **Package manager:** pnpm

## Struktur Folder
```
app/
  login/
    page.tsx          — halaman login
    actions.ts        — server actions: login(), logout()
  admin/              — semua route protected (middleware.ts)
    _components/
      AdminSidebar.tsx
    dashboard/
      page.tsx
      _components/    — komponen khusus halaman ini
      _hooks/         — hooks khusus halaman ini
lib/
  supabase.ts
  supabase-server.ts  — untuk Server Components
  supabase-browser.ts — untuk Client Components
  sheets.ts           — Google Sheets API v4 (fetchSheetData)
middleware.ts
```

## Auth
- Supabase Auth (email + password)
- Middleware: semua `/admin/*` protected, redirect ke `/login`
- Login/Logout: Server Actions
- Server Component → `createSupabaseServer()` → `supabase.auth.getUser()`
- Client Component → `supabaseBrowser` → `supabase.auth.getUser()`

## Data Sources
| Data | Sumber | Cara Fetch |
|------|--------|------------|
| Gangguan penyulang | Google Sheets | `fetchSheetData()` dari `lib/sheets.ts` |
| Segment jaringan | Google Apps Script | fetch ke Apps Script URL |
| Inspeksi, Gardu, Petugas, dst | Supabase | `supabaseBrowser` / `createSupabaseServer()` |

Google Sheets: `SPREADSHEET_ID = "153-gxDh8XrlT1AbNWb5jws0MVc-qD9IQNxxJLRqlKJg"`, `API_KEY` di `lib/sheets.ts`
Apps Script URL: `https://script.google.com/macros/s/AKfycbz_CriWnHRXCW48e5hQv_aIzOSgvX1tYSAVW-2-fVYhorSuPxGrlqiTzBr6Eao00HdT-Q/exec`

## Design System — PLN Teal

| Token | Value |
|-------|-------|
| Primary | `#00897B` |
| Primary Dark | `#004D40` |
| Background | `#F4F6F8` |
| Border | `#E2E8F0` |
| Text | `#1B2631` |
| Text secondary | `#5D6D7E` |
| Table header bg | `#E0F2F1` |
| Table header text | `#00695C` |

### Pola UI Wajib
```
Page header   : bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6
Card          : bg-white rounded-xl shadow-sm border border-[#E2E8F0]
Input         : border border-[#E2E8F0] rounded-lg px-3 py-2 focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20
Tombol primary: bg-linear-to-r from-[#004D40] to-[#00897B] text-white
Tabel header  : bg-[#E0F2F1] text-[#00695C] font-semibold
Status aktif  : bg-green-50 text-green-700
Status nonaktif: bg-gray-100 text-gray-500
Spinner       : border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin
```

### Tailwind v4 — Class yang Berubah
- `bg-gradient-to-r` → `bg-linear-to-r`
- `flex-shrink-0` → `shrink-0`
- Tidak ada `tailwind.config.js` untuk tema — gunakan `@theme {}` di CSS

## Sistem Role & Unit

### Roles
| Role | Unit | Akses Data |
|------|------|-----------|
| `UP3` | null (semua) | Semua unit, ada dropdown filter ULP |
| `admin` | unit tertentu | Hanya data unit sendiri, semua fitur |
| `inspektor` | unit tertentu | Hanya data unit sendiri, bisa input inspeksi |
| `HARJAR` | unit tertentu | Task yang eksekutor = HARJAR, unit sendiri |
| `HARGAR` | unit tertentu | Task yang eksekutor = HARGAR, unit sendiri |
| `PERABASAN` | unit tertentu | Inspeksi pohon yang ditugaskan ke PERABASAN |
| `YANGU` | unit tertentu | Task yang eksekutor = YANGU, unit sendiri |
| `PDKB` | unit tertentu | Task yang eksekutor = PDKB, unit sendiri |

### Units (ULP)
`AMPENAN` · `CAKRANEGARA` · `GERUNG` · `TANJUNG`

### Aturan Filter Data
- `UP3`: tidak ada filter unit, bisa pilih ULP via dropdown
- Semua role lain: selalu filter `ulp = user.unit`
- Tim eksekutor (HARJAR/HARGAR/PERABASAN/YANGU/PDKB): tambahan filter `eksekutor = user.role`

### Cara Pakai di Kode

**Server Component:**
```ts
import { getCurrentUser } from "@/lib/auth";
const user = await getCurrentUser();
// user: { id, email, name, role, unit }
```

**Client Component:**
```ts
import { useCurrentUser } from "@/app/admin/_context/UserContext";
const user = useCurrentUser();
```

**Filter query Supabase:**
```ts
import { buildUnitFilter, canSeeAllUnits } from "@/lib/roles";
// Auto-filter unit, UP3 tidak difilter
const query = buildUnitFilter(supabase.from("inspeksi").select("*"), user);
```

**Cek permission:**
```ts
import { canUpdateStatus, canAssignEksekutor, canSeeAllUnits } from "@/lib/roles";
```

### File Terkait
- `lib/roles.ts` — semua konstanta: Role, Unit, STATUS_CONFIG, URGENCY_CONFIG, helpers
- `lib/auth.ts` — `getCurrentUser()` untuk Server Components
- `app/admin/_context/UserContext.tsx` — `useCurrentUser()` untuk Client Components
- `scripts/schema-roles.sql` — DDL tabel user_roles + RLS

## Supabase Schema
```
petugas                    — nama, group_name, ulp, status, phone, email
user_roles                 — role: 'admin', 'UP3', 'petugas'
gardu                      — kode, nama, alamat, feeder, daya, merk, status, tgl_update, lat, lng, beban_kva, beban_persen, beban_total
jalur                      — nama, feeder, penghantar, jarak, status, warna (NO ulp column)
jalur_koordinat            — jalur_id, urutan, lat, lng
inspeksi                   — penyulang, status, temuan, tgl_inspeksi, koordinat, foto_sesudah_url, team_name, dll
inspeksi_pohon             — inspeksi pohon/rabas, sama strukturnya dengan inspeksi
preventif                  — pekerjaan preventif
preventif_team_names
pengukuran_gardu           — snapshot beban gardu per pengukuran + wo_sent_at TIMESTAMPTZ NULL
pengukuran_gardu_perjurusan
notifications
venues                     — IoT monitoring
```
Kolom Supabase: `snake_case`. Variabel TS: `camelCase`.

### Catatan Skema Penting
- `jalur` — TIDAK ada kolom `ulp`, strip sebelum insert/update
- `pengukuran_gardu.wo_sent_at` — NULL = belum di-WO, NOT NULL = sudah di-WO (timestamp)
- `inspeksi` dan `inspeksi_pohon` adalah dua tabel terpisah
- SQL migration WO: `scripts/add-pengukuran-wo-sent.sql` (jalankan manual di Supabase SQL Editor)

## Supabase Storage
Bucket: **`inspections`** (public)
```
inspections/
  jaringan/
    sebelum/    ← foto_sebelum_url (inspeksi jaringan)
    lokasi/     ← foto_lokasi_url (inspeksi jaringan)
    sesudah/    ← foto_sesudah_url (inspeksi jaringan) — diupload via app
  pohon/
    sebelum/    ← foto_sebelum_url (inspeksi pohon)
    lokasi/     ← foto_lokasi_url (inspeksi pohon)
    sesudah/    ← foto_sesudah_url (inspeksi pohon) — diupload via app
```
**Catatan migrasi:** foto_sebelum_url dan foto_lokasi_url lama masih berupa Firebase URL
(`firebasestorage.googleapis.com`). Firebase URL mungkin tidak bisa ditampilkan sebagai `<img>`
jika bucket Firebase sudah diproteksi — tampilkan link eksternal sebagai fallback.

Upload foto sesudah: `supabaseBrowser.storage.from("inspections").upload("jaringan/sesudah/{id}/{ts}.{ext}")`

## Clean Code Standards

### Prinsip Utama
1. **Sesederhana mungkin** — jangan buat abstraksi sebelum dipakai ≥3 kali
2. **Komponen kecil** — idealnya <150 baris, pisah jika sudah terlalu panjang
3. **Tidak ada kode mati** — hapus import, variabel, dan komentar yang tidak dipakai
4. **Tidak over-engineer** — jangan tambah fitur/handling untuk skenario yang belum ada

### TypeScript
- Props selalu pakai `interface`, bukan `type` (kecuali union/intersection)
- Hindari `any` — gunakan `unknown` lalu narrow, atau buat tipe yang tepat
- Konstanta tetap di luar komponen dan gunakan `SCREAMING_SNAKE_CASE`

```ts
// ✅ Benar
const NAV_ITEMS = [...] // di luar komponen

interface CardProps { title: string; value: number }

// ❌ Hindari
const navItems = [...] // di dalam komponen → re-created setiap render
```

### React / Next.js
- Server Component by default — `'use client'` hanya kalau butuh state/effect/event
- Jangan mix data-fetching server + client di komponen yang sama
- Custom hook: satu tujuan, kembalikan objek dengan nama eksplisit
- Jangan pakai `useEffect` untuk derive state — gunakan `useMemo`

```ts
// ✅ Derive dengan useMemo
const total = useMemo(() => data.reduce(...), [data])

// ❌ Hindari anti-pattern
const [total, setTotal] = useState(0)
useEffect(() => { setTotal(data.reduce(...)) }, [data])
```

### Styling
- Gunakan Tailwind class langsung, tidak perlu `cn()` kecuali ada kondisi kompleks
- Dynamic class pakai template literal atau ternary:
  ```tsx
  className={`base-class ${condition ? "active" : "inactive"}`}
  ```
- Hindari `style={{}}` kecuali untuk nilai yang tidak bisa diwakili Tailwind (misal: `width: `${pct}%``)
- Jangan duplicate class pattern — ekstrak ke variabel jika dipakai ≥3 kali di file yang sama

### Performance
- Gambar: pakai `next/image`
- Data besar di client: paginate atau virtualize, jangan render ribuan DOM node
- Chart.js: destroy canvas sebelum re-render (react-chartjs-2 sudah handle otomatis)
- Leaflet: wajib `dynamic(() => import(...), { ssr: false })`
- `useMemo`/`useCallback`: pakai hanya kalau ada bukti perlu (profiling), bukan defensive

### File & Folder
- Komponen spesifik halaman → `app/admin/[halaman]/_components/`
- Hook spesifik halaman → `app/admin/[halaman]/_hooks/`
- Utility shared → `lib/`
- Tidak perlu `index.ts` re-export kecuali ada alasan kuat

## Konvensi Kode
```
Component file : PascalCase.tsx
Hook file      : useCamelCase.ts
Utility file   : camelCase.ts
Constant       : SCREAMING_SNAKE_CASE
Variable/func  : camelCase
```

## Status Halaman
| Halaman | Route | Status | Catatan |
|---------|-------|--------|---------|
| Login | `/login` | ✅ Done | |
| Dashboard | `/admin/dashboard` | ✅ Done | |
| Command Center | `/admin/command-center` | ✅ Done | Root `/` redirect ke sini |
| Pengukuran Gardu | `/admin/pengukuran-gardu` | ✅ Done | WO marking, PDF WO, filter multi-kriteria |
| Monitoring Inspeksi | `/admin/monitoring-inspeksi` | ✅ Done | Peta interaktif, filter ULP+status |
| Score Board LM | `/admin/scoreboard` | ✅ Done | Lead Measures, Gangguan Penyulang, Mode Presentasi |
| Morning Brief | `/admin/morning-brief` | ✅ Done | Auto-send Telegram jam 08.00 WITA |
| Manajemen Petugas | `/admin/petugas` | 🔲 | |
| Peta Gardu | `/admin/peta-gardu` | 🔲 | |
| Dashboard Penyulang | `/admin/dashboard-penyulang` | 🔲 | |

## Fitur yang Sudah Dikerjakan (Log)

### Pengukuran Gardu (`/admin/pengukuran-gardu`)
- Tabel rekap beban gardu dengan filter multi-kriteria (status, penyulang, ULP, overload, suhu)
- `GarduDetailModal` — detail gardu + riwayat history pengukuran
- `KirimWAGarduModal` — generate PDF Work Order → share via Web Share API / download
- **WO Marking** — tombol "Tandai Sudah di-WO" setelah PDF dibuat, update `wo_sent_at` di DB
  - Badge "WO DIKIRIM" di header modal jika sudah di-WO
  - Badge "WO" di tabel rekap dan history rows
  - `onRefresh` callback untuk sync data setelah marking

### Monitoring Inspeksi (`/admin/monitoring-inspeksi`)
- Tab Jaringan, Pohon, Peta, Dashboard
- KPI cards (total jaringan, pohon, belum selesai, selesai bulan ini, pohon sangat urgent)
- **Filter ULP global** — dikelola di page level, di-pass ke semua tab via props
- Tab Peta — Leaflet map dengan:
  - Toggle layer Jaringan / Pohon
  - **Filter status checklist** — Temuan/Perlu Tindakan/Ditugaskan/Dalam Proses/Selesai
  - Marker berwarna berdasarkan status (bukan urgency)
  - Popup kaya: penyulang, temuan, petugas (jika ditugaskan/proses/selesai), keterangan
  - Height `h-[75vh] min-h-[520px]`

### Score Board Lead Measures (`/admin/scoreboard`)
- CRUD Lead Measure (nama, PIC, komitmen minggu depan) + item pekerjaan per LM (unlimited)
- Tabel target & realisasi per minggu (M1–M4) + total bulanan, inline editable (klik sel → input)
- Status WIN/LOSE otomatis per minggu dan total (target=0 → tampil "—")
- **Salin ke Bulan Lain** — duplikasi struktur LM + item, reset realisasi ke 0
- **Rekap Gangguan Penyulang** — tabel di atas LM, data dari Google Sheets (import) + manual (Supabase `gangguan_detail`)
  - Import dari Sheets: filter by bulan/tahun/ulp, checklist pilih row, bulk save ke Supabase
  - CRUD manual: tambah, edit, hapus per baris (titik gangguan, tgl, jam padam, durasi, jml_plgn, jml×plgn_padam, penyebab, pain_point, lesson_learned, tindak_lanjut)
- **Mode Presentasi** (slide per slide, seperti PowerPoint):
  - Slide 0: Rekap Gangguan Penyulang (header PLN branded)
  - Slide 1, 2, ...: masing-masing Lead Measure
  - Navigasi: tombol `◀ ▶` + keyboard `← →` / `Space`
  - Dot indicator — klik langsung lompat ke slide
  - Toolbar floating di bawah tengah: counter "1/5", fullscreen, print, exit
  - Logo Danantara (kiri) + Logo PLN (kanan) di setiap header slide
  - Semua tombol edit/hapus disembunyikan, sel jadi read-only

#### Supabase Tables
- `lead_measures` — id, ulp, bulan, tahun, nama, pic, komitmen, urutan
- `lead_measure_items` — id, lm_id (FK CASCADE), nama_item, satuan, target_m1..m4, realisasi_m1..m4
- `gangguan_detail` — id, ulp, bulan, tahun, titik_gangguan, tgl_gangguan, jam_padam, durasi, jml_plgn, jml_x_plgn_padam, penyebab, pain_point, lesson_learned, tindak_lanjut, urutan
- Script DDL: `scripts/scoreboard-schema.sql`, `scripts/gangguan-detail-schema.sql`

#### Files
```
app/admin/scoreboard/
  page.tsx                          — slide navigation, normal/present mode split
  _hooks/
    useScoreboard.ts                — CRUD LM + items, TargetField/RealisasiField types
    useGangguanDetail.ts            — CRUD gangguan_detail, bulkAdd
  _components/
    LMCard.tsx                      — card LM + ItemTable, EditableCell, KomitmenEdit
    AddLMModal.tsx                  — dual-purpose add/edit via initial? prop
    AddItemModal.tsx                — form item baru, same-target checkbox atau per-minggu
    DuplicateModal.tsx              — salin LM ke bulan lain
    GangguanDetailSection.tsx       — tabel gangguan + presentMode header
    GangguanDetailModal.tsx         — form add/edit gangguan manual
    ImportSheetsModal.tsx           — import dari Google Sheets gangguanPenyulang
```

### Morning Brief (`/admin/morning-brief`)
- Rangkuman kejadian kemarin: gangguan penyulang, pengukuran gardu (overload/suhu tinggi), inspeksi jaringan & pohon
- **Auto-send Telegram** jam 08.00 WITA via Vercel cron (`0 0 * * *` — Hobby plan, 1x/hari)
- Setting jam kirim manual tersimpan di tabel `morning_brief_settings` (id=1 singleton)
- Cron route: `app/api/morning-brief/send/route.ts` — hardcode `OVERLOAD_PCT=80`, `HIGH_TEMP_C=60` (jangan import dari client hook)
- Bot Telegram: `@smartmataram_bot`, group "Smart mataram"
- Env vars Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`

### Bug Fixes & Build
- Fix Vercel TypeScript build errors (literal type inference, Role type widening)
- Fix root `/` menampilkan halaman test → redirect ke `/admin/command-center`

## Optimasi UI/UX & Performa — Aturan Wajib

### Pola yang HARUS selalu diterapkan:
1. **State lifting** — filter/state yang dipakai banyak komponen, kelola di parent tertinggi yang perlu, jangan duplikasi
2. **useMemo untuk filter/transform** — jangan pakai `useEffect` + `useState` untuk derive data
3. **Konstanta di luar komponen** — array/object yang tidak berubah jangan di-inlined dalam JSX
4. **Dynamic import + ssr:false** — wajib untuk Leaflet, PDF renderer (`@react-pdf/renderer`)
5. **Marker cleanup pattern** — Leaflet: flag `_customMarker` + `eachLayer` remove sebelum re-add
6. **Pagination** — tabel data besar wajib paginate (20/halaman), jangan render semua sekaligus
7. **Filter di level data, bukan di level render** — `useMemo` dengan dependency array tepat
8. **`useCallback` hanya jika ada bukti perlu** — jangan defensive, ukur dulu
9. **Local patch, bukan full refresh** — setelah mutasi satu baris (update field, marking), patch state lokal via `patchRow(id, patch)` — jangan re-fetch semua data. Re-fetch hanya untuk mutasi yang mengubah banyak baris. Contoh pola di `usePengukuranGardu`: `patchRow` (instant) dan `fetchAndPatchRow` (re-fetch 1 baris setelah edit kompleks).
10. **Server-side first** — default Server Component, `use client` hanya jika butuh state/event/effect. Data fetching di server jika memungkinkan.
11. **Reusable components** — jika komponen/UI sama dipakai ≥2 tempat, ekstrak ke `app/admin/_components/`. Contoh: `LoadingOverlay.tsx` (spinner + success state).

### Anti-pattern yang harus dihindari:
- `useEffect` untuk derive state → pakai `useMemo`
- Fetch data di banyak komponen untuk data yang sama → lift ke parent + pass props
- Konstanta array/object di dalam komponen body → pindah ke module scope
- `style={{}}` untuk nilai yang bisa pakai Tailwind class
- **Full refresh setelah mutasi satu baris** → patch state lokal saja, urutan tabel tidak berubah
- **`onRefresh` callback yang memanggil re-fetch semua** → ganti dengan `onPatchRow(id, patch)`

## Project Lama (referensi)
Path: `d:/smart-mataram` — React+Vite+Firebase.
Gunakan sebagai referensi logika & UI saat migrasi. Jangan copy struktur Firebase/Redux-nya.

## User Preferences
- Bahasa: Indonesia
- UI: bersih, elegan, profesional (PLN Teal)
- Kode: clean code, tidak bikin web berat
- Performa & optimasi selalu jadi pertimbangan di setiap fitur
