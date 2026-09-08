"use client";

import { useCurrentUser } from "@/app/admin/_context/UserContext";
import PersetujuanHargardu from "./_components/PersetujuanHargardu";

/**
 * Pemeliharaan Gardu — persetujuan.
 *
 * Belum bertab karena baru satu isinya. Dashboard tiga kelompok, daftar
 * pekerjaan tertunda, dan pengaturan item menyusul sebagai tab di halaman yang
 * sama — menambah tab nanti lebih murah daripada memaksa satu tab hari ini.
 */
export default function HargarduPage() {
  const user = useCurrentUser();
  return (
    <div className="text-ink flex flex-col gap-4">
      <PersetujuanHargardu user={user} />
    </div>
  );
}
