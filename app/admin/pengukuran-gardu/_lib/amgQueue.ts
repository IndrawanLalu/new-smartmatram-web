import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Masukkan pengukuran ke antrean kirim AMG.
 *
 * `/api/amg-queue` memakai klien service-role (`supabaseAdmin`), dan klien itu
 * TIDAK membaca cookie sesi. Satu-satunya cara ia mengenali pengguna adalah
 * header `Authorization: Bearer <access_token>` — tanpa itu jawabannya 401
 * "Unauthorized", meskipun pengguna jelas-jelas sedang login di tab yang sama.
 *
 * Fungsi ini ada karena empat baris pengambilan token itu sudah tersalin di
 * tiga tempat, dan salah satunya — tombol di tab Tindak Lanjut Anomali —
 * ketinggalan header-nya sehingga tombolnya tidak pernah bisa dipakai. Selama
 * pemanggilnya masih menyusun `fetch` sendiri-sendiri, pemanggil keempat akan
 * mengulang kesalahan yang sama.
 *
 * @returns `null` bila berhasil, atau pesan kesalahan siap tampil.
 */
export async function antreKeAmg(ids: string | string[]): Promise<string | null> {
  const daftar = Array.isArray(ids) ? ids : [ids];
  if (daftar.length === 0) return "Tidak ada pengukuran yang dipilih";

  try {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      // Dibedakan dari 401 milik server: yang ini murni sesi klien sudah habis,
      // dan yang perlu dilakukan pengguna berbeda — masuk lagi, bukan lapor.
      return "Sesi login sudah berakhir. Muat ulang halaman lalu masuk kembali.";
    }

    const res = await fetch("/api/amg-queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ pengukuranIds: daftar }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const pesan = (body as { error?: string }).error;
      if (res.status === 401) {
        return "Sesi login ditolak server. Muat ulang halaman lalu masuk kembali.";
      }
      return pesan ?? `Gagal mengantre ke AMG (HTTP ${res.status})`;
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Gagal mengantre ke AMG";
  }
}
