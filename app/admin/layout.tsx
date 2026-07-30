import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UserProvider } from "./_context/UserContext";
import AdminSidebar from "./_components/AdminSidebar";
import ChatFab from "./_components/ChatFab";
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
          <AdminSidebar
            userEmail={user.email}
            userName={user.name}
            userRole={user.role}
            userUnit={user.unit}
          />
          <main className="flex-1 min-w-0 p-6 overflow-y-auto">{children}</main>
          <ChatFab />
        </div>
      </ToastProvider>
    </UserProvider>
  );
}
