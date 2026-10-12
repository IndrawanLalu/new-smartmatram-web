import { Loader2 } from "lucide-react";

/**
 * Tampil seketika saat pindah halaman admin (12 Okt 2026). Tanpa berkas ini
 * Next menahan halaman lama di layar sampai halaman baru selesai dimuat dari
 * server — klik menu terasa "tidak terjadi apa-apa", lalu orang mengklik
 * berkali-kali. Berkas ini juga membuat menu bisa dimuat lebih dulu (prefetch)
 * sampai batas ini.
 */
export default function Memuat() {
  return (
    <div className="h-full min-h-[50vh] flex flex-col items-center justify-center gap-3 text-ink-soft" role="status">
      <Loader2 size={28} className="animate-spin text-navy-600" />
      <p className="text-sm">Memuat halaman…</p>
    </div>
  );
}
