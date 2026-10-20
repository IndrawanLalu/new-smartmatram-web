import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import PetaJaringan from "./_components/PetaJaringan";

export const metadata = { title: "Peta Jaringan — SMART Mataram" };

export default async function PetaPage({
  searchParams,
}: {
  searchParams: Promise<{ jtr?: string; ulp?: string; pohon?: string; mode?: string; rencana?: string; jurusan?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const rencana = sp.rencana && sp.jurusan ? { gardu: sp.rencana, jurusan: sp.jurusan.toUpperCase() } : undefined;
  return <PetaJaringan user={user} awal={{ jtr: sp.jtr, ulp: sp.ulp, pohon: sp.pohon === "1", sld: sp.mode === "sld", rencana }} />;
}
