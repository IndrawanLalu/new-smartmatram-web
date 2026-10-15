import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UserProvider } from "./_context/UserContext";
import UserMenu from "./_components/UserMenu";
import AskAi from "./_components/AskAi";
import { ToastProvider } from "./_components/Toast";
import SidebarGelap from "./_kit/SidebarGelap";
import GrupTopbar from "./_kit/GrupTopbar";
import KepalaOtomatis from "./_kit/KepalaOtomatis";
import { SlotProvider, WadahTopbar } from "./_kit/SlotKerangka";

/**
 * Kerangka admin — UI baru (rencana-ui-baru.md, 14 Okt 2026):
 *   sidebar navy gelap · topbar putih (kelompok menu, saringan halaman, Tanya
 *   AI, pengguna) · kepala halaman otomatis dari `_nav.ts` (ikon, judul,
 *   keterangan, banner, tab halaman).
 *
 * Isi halaman tetap dibungkus `p-6` seperti sebelumnya — halaman yang belum
 * dimigrasi (termasuk yang mengandalkan `-m-6` / `100vh - --topbar-h`) tetap
 * berdiri apa adanya di bawah kepala halaman.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_active) redirect("/login?error=inactive");
  if (user.platform === "mobile") redirect("/login?error=no_web_access");

  return (
    <UserProvider user={user}>
      <ToastProvider>
        <SlotProvider>
          {/* Warna teks TIDAK diset di sini: halaman yang belum dimigrasi masih
              bertema gelap dan mengandalkan warna terang bawaan body. Halaman
              yang sudah terang menetapkan `text-ink` sendiri di root-nya. */}
          <div className="h-screen overflow-hidden bg-surface flex">
            <SidebarGelap userUnit={user.unit} />
            <div className="flex-1 min-w-0 flex flex-col">
              <header className="h-[var(--topbar-h)] shrink-0 flex items-center gap-3 border-b border-line bg-white px-6 text-ink">
                <GrupTopbar />
                <WadahTopbar />
                <AskAi />
                <UserMenu userEmail={user.email} userName={user.name} userRole={user.role} userUnit={user.unit} />
              </header>
              <main className="flex-1 min-w-0 overflow-y-auto">
                <KepalaOtomatis />
                <div className="p-6">{children}</div>
              </main>
            </div>
          </div>
        </SlotProvider>
      </ToastProvider>
    </UserProvider>
  );
}
