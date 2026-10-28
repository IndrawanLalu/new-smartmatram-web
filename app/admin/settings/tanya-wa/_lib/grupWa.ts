import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Grup WA dari Setting WA Group → label yang dibaca manusia. Grup milik satu
 * ULP = "Grup ULP X" (ULP itu jadi bawaan pertanyaan di grup tersebut);
 * grup yang dipakai beberapa ULP = "Grup UP3 (semua ULP)".
 */
export async function muatGrupWa(): Promise<Map<string, string>> {
  const { data } = await supabaseBrowser.from("wa_settings").select("ulp,group_id");
  const per = new Map<string, Set<string>>();
  for (const r of data ?? []) if (r.group_id) per.set(r.group_id, (per.get(r.group_id) ?? new Set()).add(r.ulp ?? ""));
  return new Map(
    [...per].map(([g, u]) => {
      const ulp = [...u];
      return [g, ulp.length === 1 && ulp[0] ? `Grup ULP ${ulp[0]}` : "Grup UP3 (semua ULP)"];
    }),
  );
}
