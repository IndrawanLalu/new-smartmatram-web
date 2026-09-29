"use client";

import React, { useEffect, useState } from "react";
import { Download, ExternalLink, Loader2, Share2 } from "lucide-react";
import type { DocumentProps } from "@react-pdf/renderer";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import { labelBulan, namaBerkas, type PaketSurat } from "../_lib/woSurat";

/**
 * PDF dilihat dulu sebelum dikirim (permintaan user). Kirim = lembar bagikan
 * HP/Chrome → pilih WhatsApp. Peramban yang tidak bisa membagikan berkas
 * mengunduhnya, lalu dilampirkan di WhatsApp Web.
 */

interface Props {
  paket: PaketSurat;
  onTutup: () => void;
  /** Mencatat surat sebagai terbit — dipanggil saat dikirim atau diunduh. */
  onTerbit: () => Promise<void>;
}

async function buatPdf(paket: PaketSurat) {
  const [{ pdf }, { default: WoSuratPdf }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("../_lib/WoSuratPdf"),
  ]);
  const el = React.createElement(WoSuratPdf, { paket }) as unknown as React.ReactElement<DocumentProps>;
  return pdf(el).toBlob();
}

export default function PratinjauWoModal({ paket, onTutup, onTerbit }: Props) {
  const toast = useToast();
  const [pdf, setPdf] = useState<{ blob: Blob; url: string } | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const berkas = namaBerkas(paket.ulp, paket.tahun, paket.bulan, "pdf");

  useEffect(() => {
    let url: string | null = null;
    let hidup = true;
    buatPdf(paket)
      .then((blob) => {
        if (!hidup) return;
        url = URL.createObjectURL(blob);
        setPdf({ blob, url });
      })
      .catch((e: Error) => { if (hidup) setGalat(e.message); });
    return () => {
      hidup = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [paket]);

  const catat = async () => {
    try {
      await onTerbit();
    } catch (e) {
      toast.error(`PDF tetap dibuat, tapi surat gagal dicatat: ${e instanceof Error ? e.message : e}`);
    }
  };

  const unduh = async () => {
    if (!pdf) return;
    await catat();
    const a = document.createElement("a");
    a.href = pdf.url;
    a.download = berkas;
    a.click();
  };

  const kirim = async () => {
    if (!pdf) return;
    const file = new File([pdf.blob], berkas, { type: "application/pdf" });
    if (!navigator.canShare?.({ files: [file] })) {
      await unduh();
      toast.info("Peramban ini tidak bisa membagikan berkas. PDF diunduh — lampirkan di WhatsApp Web.");
      return;
    }
    setSibuk(true);
    try {
      await navigator.share({ files: [file], title: `WO Yantek ${paket.ulp} ${labelBulan(paket.tahun, paket.bulan)}` });
      await catat();
      toast.success("WO dibagikan.");
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) toast.error(e instanceof Error ? e.message : "Gagal membagikan");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <ModalShell
      title="Pratinjau WO"
      subtitle={`${berkas} · surat + ${paket.lampiran.length} lampiran`}
      maxWidth="max-w-5xl"
      onClose={onTutup}
      footer={
        <>
          <button onClick={onTutup} className={BTN_GHOST}>Kembali</button>
          <div className="flex gap-2">
            {pdf && (
              <a href={pdf.url} target="_blank" rel="noreferrer" className={BTN_GHOST}>
                <ExternalLink size={14} /> Tab baru
              </a>
            )}
            <button onClick={() => void unduh()} className={BTN_GHOST} disabled={!pdf}>
              <Download size={14} /> Unduh PDF
            </button>
            <button onClick={() => void kirim()} className={BTN_PRIMARY} disabled={!pdf || sibuk}>
              {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Kirim ke WhatsApp
            </button>
          </div>
        </>
      }
    >
      {galat ? (
        <p className="text-sm text-red-600">PDF gagal dibuat: {galat}</p>
      ) : !pdf ? (
        <div className="h-[65vh] flex items-center justify-center gap-2 text-sm text-ink-soft">
          <Loader2 size={16} className="animate-spin" /> Membuat PDF…
        </div>
      ) : (
        // HP Android tidak punya penampil PDF di dalam halaman — "Tab baru" untuk itu.
        <iframe src={pdf.url} title="Pratinjau WO" className="w-full h-[65vh] rounded-lg border border-line" />
      )}
    </ModalShell>
  );
}
