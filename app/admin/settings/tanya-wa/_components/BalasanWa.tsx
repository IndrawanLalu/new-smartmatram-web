import type { ReactNode } from "react";

/**
 * Gelembung balasan seperti di WhatsApp: *tebal* dan _miring_ ditampilkan,
 * gambar (kartu gardu) di atas keterangannya.
 */

export type BalasanUji = string | { mediaUrl: string; caption: string };

const POLA = /(\*[^*\n]+\*|_[^_\n]+_)/g;

function format(teks: string): ReactNode[] {
  return teks.split(POLA).map((b, i) =>
    b.length > 2 && b.startsWith("*") && b.endsWith("*") ? (
      <strong key={i}>{b.slice(1, -1)}</strong>
    ) : b.length > 2 && b.startsWith("_") && b.endsWith("_") ? (
      <em key={i}>{b.slice(1, -1)}</em>
    ) : (
      b
    ),
  );
}

export default function BalasanWa({ balasan }: { balasan: BalasanUji }) {
  const teks = typeof balasan === "string" ? balasan : balasan.caption;
  return (
    <div className="rounded-2xl bg-[#e7f6dc] shadow-sm p-2 max-w-md">
      {typeof balasan !== "string" && (
        // eslint-disable-next-line @next/next/no-img-element -- gambar sekali tampil dari storage, tidak perlu optimasi next/image
        <img src={balasan.mediaUrl} alt="Kartu gardu" className="rounded-xl w-full mb-1.5" />
      )}
      <div className="px-1.5 pb-0.5 text-[13px] leading-relaxed text-[#111b21] whitespace-pre-wrap break-words">{format(teks)}</div>
    </div>
  );
}
