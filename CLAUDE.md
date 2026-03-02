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
petugas          — nama, group_name, ulp, status, phone, email
user_roles       — role: 'admin', 'UP3', 'petugas'
gardu            — kode, nama, alamat, feeder, daya, merk, status, tgl_update, lat, lng, beban_kva, beban_persen, beban_total
jalur            — nama, feeder, penghantar, jarak, status, warna
jalur_koordinat  — jalur_id, urutan, lat, lng
inspeksi         — penyulang, status, temuan, tgl_inspeksi (snake_case)
inspeksi_pohon   — inspeksi pohon/rabas
preventif        — pekerjaan preventif
preventif_team_names
pengukuran_gardu
pengukuran_gardu_perjurusan
notifications
venues           — IoT monitoring
```
Kolom Supabase: `snake_case`. Variabel TS: `camelCase`.

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
| Halaman | Route | Status |
|---------|-------|--------|
| Login | `/login` | ✅ Done |
| Dashboard | `/admin/dashboard` | ✅ Done |
| Manajemen Petugas | `/admin/petugas` | 🔲 |
| Peta Gardu | `/admin/peta-gardu` | 🔲 |
| Dashboard Penyulang | `/admin/dashboard-penyulang` | 🔲 |
| Monitoring Inspeksi | `/admin/monitoring-inspeksi` | ✅ Done |

## Project Lama (referensi)
Path: `d:/smart-mataram` — React+Vite+Firebase.
Gunakan sebagai referensi logika & UI saat migrasi. Jangan copy struktur Firebase/Redux-nya.

## User Preferences
- Bahasa: Indonesia
- UI: bersih, elegan, profesional (PLN Teal)
- Kode: clean code, tidak bikin web berat
