/**
 * Klien wa-gateway (Baileys) untuk Smart Mataram — menggantikan wa-bot (whatsapp-web.js).
 * Smart Mataram = SATU nomor → satu sesi gateway (default id "smart-mataram").
 * Flag-gated: aktif hanya jika WA_USE_GATEWAY=true DAN url+key terisi.
 */

const BASE = process.env.WA_GATEWAY_URL; // mis. http://127.0.0.1:3001
const KEY = process.env.WA_GATEWAY_KEY; // API key tenant "smart-mataram"
const SESSION = process.env.WA_GATEWAY_SESSION || "smart-mataram";

export function gatewayEnabled(): boolean {
  return process.env.WA_USE_GATEWAY === "true" && !!BASE && !!KEY;
}

export function gatewaySession(): string {
  return SESSION;
}

async function gw(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Api-Key": KEY as string, ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `gateway ${res.status}`);
  return data;
}

export interface GatewaySendPayload {
  to: string;
  text?: string;
  mediaUrl?: string;
  caption?: string;
  replyTo?: string;
}

/** Kirim pesan lewat gateway (ke sesi Smart Mataram). */
export async function gatewaySend(payload: GatewaySendPayload): Promise<{ id?: string }> {
  const d = await gw(`/sessions/${SESSION}/send`, { method: "POST", body: JSON.stringify(payload) });
  return { id: d.id };
}

/** Daftar grup WA (untuk halaman konfigurasi group_id). */
export async function gatewayListGroups(): Promise<{ id: string; nama: string }[]> {
  const d = await gw(`/sessions/${SESSION}/groups`);
  return (d.groups as { id: string; nama: string }[]) || [];
}
