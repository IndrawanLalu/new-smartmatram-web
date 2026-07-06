# Notif Urgent Realtime (anti-putus) — Panduan Cutover

Jalur realtime baru yang **self-contained di VPS**: wa-bot subscribe langsung ke
Supabase Realtime (`postgres_changes`) lalu kirim WA via `client.sendMessage()`.
Menggantikan jalur webhook `Supabase → /api/wa-notify` yang rapuh terhadap
"secret drift" / ganti domain (bisa mati diam-diam via 401 senyap).

**File:** `wa-bot/realtime.js` · di-start dari `wa-bot/index.js` saat bot `ready`.

## Cara kerja
| Tabel | Kondisi | Kategori group (wa_settings) |
|-------|---------|------------------------------|
| `inspeksi` | `category = "Urgent"` | `jaringan` |
| `inspeksi_pohon` | `tingkat_risiko = "Sangat Tinggi"` | `perabasan` |

- INSERT → selalu notif. UPDATE → hanya saat **transisi menjadi** urgent (anti-spam edit).
- Group ID per-ULP dibaca dari `wa_settings` (sama seperti jalur lama).
- Dedupe in-memory 5 menit (cegah dobel dari INSERT+UPDATE beruntun).
- **Backstop:** `reminder.js` tetap kirim ulang temuan urgent belum selesai
  jam 08/11/15/18 WITA — menyusul event realtime yang mungkin terlewat saat bot down.

## Prasyarat (sudah terpenuhi, tinggal verifikasi)
- `@supabase/supabase-js` ada di root `node_modules` (dipakai app) → wa-bot bisa `require`.
- `.env.local` VPS punya `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- Tabel sudah di publication realtime → `scripts/enable-realtime.sql`
  (`inspeksi`, `inspeksi_pohon` sudah didaftarkan). Cek: sudah dijalankan di Supabase.

## Langkah cutover (saat siap deploy — JANGAN sekarang)
1. Deploy kode ke VPS (`git pull` di `/var/www/smart-mataram`).
2. Aktifkan flag: di `ecosystem.config.js` app `wa-bot`, set `WA_REALTIME_ENABLED: "true"`.
3. **Nonaktifkan webhook Supabase** supaya TIDAK dobel kirim — pilih salah satu:
   - Dashboard: Database → (Webhooks/Integrations) → disable/hapus hook `inspeksi` & `inspeksi_pohon`, atau
   - SQL Editor: `DROP TRIGGER <nama_trigger> ON public.inspeksi;` (dan `inspeksi_pohon`).
     Cari nama trigger via:
     ```sql
     select c.relname, t.tgname
     from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and c.relname in ('inspeksi','inspeksi_pohon');
     ```
4. Restart bot: `pm2 restart wa-bot --update-env`.
5. Verifikasi log: `pm2 logs wa-bot` → harus muncul
   `📡 Realtime listener: SUBSCRIBED` dan `✅ Realtime notif aktif ...`.
6. Test: input 1 temuan urgent asli → cek WA masuk ke group ULP + log `✅ Realtime: notif terkirim`.

## Rollback (jika perlu balik ke webhook)
1. Set `WA_REALTIME_ENABLED: "false"` → `pm2 restart wa-bot --update-env`.
2. Aktifkan lagi webhook Supabase, pastikan header `x-webhook-secret` == `CRON_SECRET` VPS.

## Catatan
- Jangan aktifkan flag **dan** webhook bersamaan → dobel kirim.
- Service role key TIDAK ditaruh di `ecosystem.config.js` (dibaca dari `.env.local`).
- `/api/wa-notify` dibiarkan tetap ada sebagai opsi rollback; bisa dihapus setelah stabil.
- Perbaikan minor vs jalur lama: pesan pohon memakai kolom `deskripsi`
  (tabel `inspeksi_pohon` tidak punya kolom `temuan`; jalur webhook lama keliru pakai `temuan`).
