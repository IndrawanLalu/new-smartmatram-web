import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UserProvider } from "@/app/admin/_context/UserContext";
import { ToastProvider } from "@/app/admin/_components/Toast";

/**
 * Peta jaringan berdiri DI LUAR `/admin`, dan itu bukan soal rapi-rapian.
 *
 * Layout `/admin` memasang sidebar dan topbar untuk seluruh anaknya, dan di
 * Next.js layout induk tidak bisa dilepas dari dalam. Peta yang dipakai sambil
 * menelusuri jaringan butuh seluruh lebar layar — sidebar di kiri berebut tempat
 * dengan panel lapisan yang justru jadi alat utamanya.
 *
 * Penjagaannya tetap sama: `middleware.ts` ikut menjaga `/peta`, dan pemeriksaan
 * di sini mengulanginya supaya halaman tidak pernah terbuka tanpa pengguna.
 */
export default async function PetaLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_active) redirect("/login?error=inactive");
  if (user.platform === "mobile") redirect("/login?error=no_web_access");

  return (
    <UserProvider user={user}>
      <ToastProvider>
        <div className="h-screen overflow-hidden bg-surface text-ink">{children}</div>
      </ToastProvider>
    </UserProvider>
  );
}
