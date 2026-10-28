/**
 * Kapan bot menjawab pertanyaan biasa (bukan "#..."):
 *   - grup  : diawali "@smart"/"smart", atau me-mention nomor bot;
 *   - pribadi: semua pesan.
 * Mengembalikan pertanyaannya (tanpa panggilan), atau null bila bukan untuk bot.
 */

export interface PesanMasuk {
  from: string;
  isGroup: boolean;
  text: string;
  raw?: unknown;
}

const PANGGILAN = /^@?smart\b[\s,:.\-!]*/i;
const BUKAN_ORANG = /@(broadcast|newsletter)$|^status@/;

export function mentionDari(raw: unknown): string[] {
  const m = (raw as { message?: Record<string, { contextInfo?: { mentionedJid?: unknown } }> } | undefined)?.message;
  if (!m) return [];
  const daftar = Object.values(m).flatMap((x) => (Array.isArray(x?.contextInfo?.mentionedJid) ? x.contextInfo.mentionedJid : []));
  return daftar.filter((j): j is string => typeof j === "string");
}

/** `botId` = bagian angka JID bot: nomor telepon dan/atau LID. */
export function bacaPanggilan(p: PesanMasuk, botId: string[]): string | null {
  if (BUKAN_ORANG.test(p.from)) return null;
  let teks = p.text.trim();
  if (!teks) return null;

  const sapa = teks.match(PANGGILAN);
  if (sapa) return teks.slice(sapa[0].length).trim() || "bantuan";

  const bot = mentionDari(p.raw).map((j) => j.split("@")[0].split(":")[0]).filter((id) => botId.includes(id));
  if (bot.length) {
    for (const id of bot) teks = teks.split(`@${id}`).join(" ");
    return teks.replace(/^[\s,:.\-!]+/, "").replace(/\s+/g, " ").trim() || "bantuan";
  }
  return p.isGroup ? null : teks;
}

/** Batas laju: satu pengirim maksimal 10 pertanyaan per menit. */
const JEJAK = new Map<string, number[]>();
export function bolehTanya(pengirim: string, sekarang = Date.now()): boolean {
  const baru = (JEJAK.get(pengirim) ?? []).filter((t) => sekarang - t < 60_000);
  if (baru.length >= 10) {
    JEJAK.set(pengirim, baru);
    return false;
  }
  baru.push(sekarang);
  JEJAK.set(pengirim, baru);
  if (JEJAK.size > 5000) JEJAK.clear();
  return true;
}
