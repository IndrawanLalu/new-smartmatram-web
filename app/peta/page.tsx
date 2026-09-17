import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import PetaJaringan from "./_components/PetaJaringan";

export const metadata = { title: "Peta Jaringan — SMART Mataram" };

export default async function PetaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <PetaJaringan user={user} />;
}
