"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const supabase = await createSupabaseServer();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/admin/dashboard");
}

export async function logout() {
  const supabase = await createSupabaseServer();
  // Hanya perangkat ini: bawaan 'global' mencabut sesi akun itu di SEMUA
  // perangkat, termasuk HP regu yang memakai akun yang sama (17 Nov 2026).
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
