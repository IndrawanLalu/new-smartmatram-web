"use client";

import { useEffect, useState } from "react";
import { Radio, Save, Loader2, CheckCircle2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { UNITS } from "@/lib/roles";

interface CfgRow {
  ulp: string;
  username: string;
  kode_prefixes: string;
  amg_url: string | null;
  hasPassword: boolean;
  updated_at: string | null;
}

async function authFetch(url: string, options: RequestInit = {}) {
  const { data: { session } } = await supabaseBrowser.auth.getSession();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
      ...(options.headers ?? {}),
    },
  });
}

export default function AmgSettingsPage() {
  const user = useCurrentUser();
  const isUP3 = user.role === "UP3";
  const isAdmin = user.role === "admin";
  const ulps = isUP3 ? UNITS.map((u) => u.value) : ([user.unit].filter(Boolean) as string[]);

  const [cfgMap, setCfgMap] = useState<Record<string, CfgRow>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await authFetch("/api/amg-config");
    const data = (await res.json()) as CfgRow[];
    const map: Record<string, CfgRow> = {};
    for (const r of Array.isArray(data) ? data : []) map[r.ulp] = r;
    setCfgMap(map);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isUP3 && !isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-[#5D6D7E]">
        Akses ditolak. Halaman ini hanya untuk UP3 dan Admin ULP.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6F8] p-6 space-y-5 text-[#1B2631]">
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6 flex items-center gap-3">
        <Radio size={26} />
        <div>
          <h1 className="text-xl font-bold">Pengaturan AMG</h1>
          <p className="text-white/70 text-sm mt-0.5">Kredensial login AMG per ULP — dipakai agen lokal untuk mengirim pengukuran.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {ulps.map((ulp) => (
            <AmgUnitCard key={`${ulp}-${cfgMap[ulp]?.updated_at ?? "new"}`} ulp={ulp} initial={cfgMap[ulp]} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function AmgUnitCard({ ulp, initial, onSaved }: { ulp: string; initial?: CfgRow; onSaved: () => void }) {
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [prefixes, setPrefixes] = useState(initial?.kode_prefixes ?? "44150,44151");
  const [amgUrl, setAmgUrl] = useState(initial?.amg_url ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await authFetch("/api/amg-config", {
      method: "PATCH",
      body: JSON.stringify({
        ulp,
        username,
        password: password || undefined, // kosong = jangan ubah
        kode_prefixes: prefixes,
        amg_url: amgUrl || undefined,
      }),
    });
    const j = await res.json();
    setSaving(false);
    if (!res.ok) { setMsg({ ok: false, text: j.error || "Gagal menyimpan" }); return; }
    setMsg({ ok: true, text: "Tersimpan" });
    setPassword("");
    onSaved();
  }

  const inputCls = "mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[#1B2631]">ULP {ulp}</h3>
        {initial?.hasPassword && (
          <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">terkonfigurasi</span>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-[#5D6D7E]">Username AMG</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} placeholder="username AMG ULP ini" />
      </div>
      <div>
        <label className="text-xs font-medium text-[#5D6D7E]">Password AMG</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
          placeholder={initial?.hasPassword ? "•••••• (tersimpan — isi untuk mengganti)" : "password AMG"}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-[#5D6D7E]">Prefix Kode Gardu</label>
          <input value={prefixes} onChange={(e) => setPrefixes(e.target.value)} className={inputCls} placeholder="44150,44151" />
        </div>
        <div>
          <label className="text-xs font-medium text-[#5D6D7E]">URL AMG (opsional)</label>
          <input value={amgUrl} onChange={(e) => setAmgUrl(e.target.value)} className={inputCls} placeholder="default 10.33.1.77" />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
        </button>
        {msg && (
          <span className={`text-xs flex items-center gap-1 ${msg.ok ? "text-green-700" : "text-red-600"}`}>
            {msg.ok && <CheckCircle2 size={13} />} {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
