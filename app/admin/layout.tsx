import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UserProvider } from "./_context/UserContext";
import AdminSidebar from "./_components/AdminSidebar";
import PageTitle from "./_components/PageTitle";
import UserMenu from "./_components/UserMenu";
import AskAi from "./_components/AskAi";
import { ToastProvider } from "./_components/Toast";

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
        {/* Warna teks TIDAK diset di sini: halaman yang belum dimigrasi masih
            bertema gelap dan mengandalkan warna terang bawaan body. Halaman yang
            sudah terang menetapkan `text-ink` sendiri di root-nya. */}
        <div className="h-screen overflow-hidden bg-surface flex">
          <AdminSidebar userUnit={user.unit} />
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Topbar setinggi --topbar-h. Halaman yang menghitung tinggi dari
                100vh (command-center, peta-gardu) ikut mengurangi var yang sama
                supaya tidak ada scrollbar liar. */}
            <header className="h-[var(--topbar-h)] shrink-0 flex items-center gap-2 border-b border-sidebar-line bg-sidebar px-4">
              <PageTitle />
              <div className="flex-1" />
              <AskAi />
              <UserMenu
                userEmail={user.email}
                userName={user.name}
                userRole={user.role}
                userUnit={user.unit}
              />
            </header>
            <main className="flex-1 min-w-0 p-6 overflow-y-auto">{children}</main>
          </div>
        </div>
      </ToastProvider>
    </UserProvider>
  );
}
