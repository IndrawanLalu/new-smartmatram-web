import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UserProvider } from "./_context/UserContext";
import AdminSidebar from "./_components/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <UserProvider user={user}>
      <div className="h-screen overflow-hidden bg-[#F4F6F8] flex">
        <AdminSidebar
          userEmail={user.email}
          userName={user.name}
          userRole={user.role}
          userUnit={user.unit}
        />
        <main className="flex-1 min-w-0 p-6 overflow-y-auto">{children}</main>
      </div>
    </UserProvider>
  );
}
