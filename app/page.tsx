import { redirect } from "next/navigation";

/** Beranda aplikasi = Dashboard Operasional (sejak 2026-08-04, sebelumnya
 *  Command Center). Command Center tetap ada sebagai layar operasional
 *  real-time, tapi bukan lagi halaman pertama yang dibuka. */
export default function RootPage() {
  redirect("/admin/dashboard");
}
