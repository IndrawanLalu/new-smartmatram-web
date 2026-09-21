"use client";

import { useCurrentUser } from "@/app/admin/_context/UserContext";
import DaftarPenyulang from "./_components/DaftarPenyulang";

/**
 * Master Penyulang — induk yang dituju gardu, tiang, dan segmen.
 *
 * Dulu sebuah tab di dalam halaman Jaringan JTM. Tempatnya keliru dengan alasan
 * yang sama seperti Master Gardu: penyulang dipakai gardu, tiang JTM, segmen,
 * dan nanti WO perabasan. Selama dia jadi anak topik salah satu modul, modul
 * berikutnya akan membuat daftar penyulangnya sendiri — dan daftar penyulang
 * yang berbeda-beda isi persis penyakit yang sedang dibereskan.
 */
export default function MasterPenyulangPage() {
  const user = useCurrentUser();
  return <DaftarPenyulang user={user} />;
}
