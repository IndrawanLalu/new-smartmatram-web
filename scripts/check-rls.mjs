import { createClient } from "@supabase/supabase-js";

const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmdm1pbXNsZHllcmNrem5lbXN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI1NDM1NSwiZXhwIjoyMDg3ODMwMzU1fQ.JWJ4wNZJeC81c-_3Da8DutClB7xzBGjVbI_bv3YYe_k";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmdm1pbXNsZHllcmNrem5lbXN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNTQzNTUsImV4cCI6MjA4NzgzMDM1NX0.W2HQPXe2Vk7C2XaL4KjMDJ63Tb-HlownnE-qZoHnetc";
const URL = "https://ffvmimsldyerckznemsu.supabase.co";

const admin = createClient(URL, SERVICE_KEY);
const anon  = createClient(URL, ANON_KEY);

// Ambil 1 row untuk test
const { data: sample } = await admin.from("inspeksi").select("id, status").limit(1).single();
console.log("Sample:", sample?.id, "|", sample?.status);

// Test SELECT dengan anon (simulasi browser)
const { data: readData, error: readErr } = await anon.from("inspeksi").select("id").limit(1);
console.log("SELECT anon:", readErr ? "BLOCKED - " + readErr.message : "OK (" + readData?.length + " rows)");

// Test UPDATE dengan anon
if (sample) {
  const { error: updateErr } = await anon
    .from("inspeksi")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sample.id);
  console.log("UPDATE anon:", updateErr ? "BLOCKED - " + updateErr.message : "OK");
}

// Test SELECT pohon
const { error: pohonErr } = await anon.from("inspeksi_pohon").select("id").limit(1);
console.log("SELECT inspeksi_pohon anon:", pohonErr ? "BLOCKED - " + pohonErr.message : "OK");
