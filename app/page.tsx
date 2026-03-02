import { supabase } from "@/lib/supabase";

export default async function Home() {
  const { data, error } = await supabase.from("test").select("*");

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Supabase Test</h1>
      {error && <p className="text-red-500">{error.message}</p>}
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </main>
  );
}
