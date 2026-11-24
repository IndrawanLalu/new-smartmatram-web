"use client";

import { useState } from "react";
import { Ban, Loader2, MapPin, Pencil, Save } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW } from "@/app/admin/_ui";
import { tanggal } from "@/app/admin/pemeliharaan-jaringan/_components/TabelPemeliharaan";
import type { KoreksiPdkb, PekerjaanPdkb } from "../_hooks/usePdkb";
import type { KategoriRef } from "@/app/admin/pemeliharaan-jaringan/_hooks/usePemeliharaanJaringan";
import FormKoreksiPdkb, { ID_FORM_KOREKSI_PDKB } from "./FormKoreksiPdkb";
import { NADA_PDKB } from "./TabelPdkb";

/**
 * Detail satu pekerjaan PDKB. Sebelum–proses–sesudah berdampingan (butir 7).
 * Keputusan admin: Koreksi isian (seperti Pemeliharaan Jaringan) atau
 * Batalkan (alasan wajib) — kalau pekerjaan ini menutup tugas, tugasnya
 * terbuka lagi.
 */

interface Props {
  b: PekerjaanPdkb;
  oleh: string;
  onTutup: () => void;
  onBatalkan: (id: string, alasan: string, oleh: string) => Promise<void>;
  kategori: KategoriRef[];
  onKoreksi: (id: string, v: KoreksiPdkb, oleh: string) => Promise<void>;
}

function Nilai({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={EYEBROW}>{label}</p>
      <div className="text-sm text-ink mt-0.5">{children}</div>
    </div>
  );
}

function Foto({ url, label }: { url: string | null; label: string }) {
  return (
    <div className="flex-1 min-w-40">
      <p className={EYEBROW}>{label}</p>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- foto Supabase Storage */}
          <img src={url} alt={label} className="mt-1 w-full h-52 object-cover rounded-xl border border-line" />
        </a>
      ) : (
        <div className="mt-1 h-52 rounded-xl border border-dashed border-line grid place-items-center text-xs text-ink-muted">—</div>
      )}
    </div>
  );
}

export default function DetailPdkbModal({ b, oleh, onTutup, onBatalkan, kategori, onKoreksi }: Props) {
  const toast = useToast();
  const [batal, setBatal] = useState(false);
  const [sunting, setSunting] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  const simpanKoreksi = async (v: KoreksiPdkb) => {
    setSibuk(true);
    try {
      await onKoreksi(b.id, v, oleh);
      toast.success("Koreksi tersimpan.");
      setSunting(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan koreksi.");
    } finally {
      setSibuk(false);
    }
  };
  const objek = b.jenis === "GARDU" ? `Gardu ${b.garduKode ?? ""}` : `${b.jenis} · ${b.penyulang ?? ""}`;

  return (
    <>
      <ModalShell
        title={`Pekerjaan PDKB · ${objek}`}
        subtitle={`${b.ulp} · ${tanggal(b.tgl)} · dicatat ${b.diinputOleh ?? "admin"}`}
        maxWidth="max-w-4xl"
        onClose={onTutup}
        footer={
          <>
            {sunting ? (
              <>
                <button onClick={() => setSunting(false)} className={BTN_GHOST} disabled={sibuk}>Batal koreksi</button>
                <button type="submit" form={ID_FORM_KOREKSI_PDKB} className={BTN_PRIMARY} disabled={sibuk}>
                  {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan koreksi
                </button>
              </>
            ) : (
              <>
                {b.status === "Tercatat" ? (
                  <span className="flex gap-2">
                    <button onClick={() => setBatal(true)} className={BTN_GHOST}><Ban size={14} /> Batalkan catatan</button>
                    <button onClick={() => setSunting(true)} className={BTN_GHOST}><Pencil size={14} /> Koreksi</button>
                  </span>
                ) : <span />}
                <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
              </>
            )}
          </>
        }
      >
        <span className={`inline-block w-fit px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${NADA_PDKB[b.status]}`}>{b.status}</span>
        {b.status === "Dibatalkan" && (
          <p className="text-xs rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700">
            <b>Dibatalkan{b.dibatalkanOleh ? ` oleh ${b.dibatalkanOleh}` : ""}{b.dibatalkanAt ? ` · ${tanggal(b.dibatalkanAt)}` : ""}:</b> {b.dibatalkanAlasan ?? "—"}
          </p>
        )}

        {b.dikoreksiAt && (
          <p className="text-[11px] text-ink-muted">Dikoreksi {tanggal(b.dikoreksiAt)}{b.dikoreksiOleh ? ` oleh ${b.dikoreksiOleh}` : ""}</p>
        )}

        {sunting ? (
          <FormKoreksiPdkb b={b} kategori={kategori} onSimpan={(v) => void simpanKoreksi(v)} />
        ) : (
        <>
        <p className="text-base font-semibold text-ink">{b.pekerjaan}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Nilai label="Kategori">{b.kategoriLabel ?? "—"}</Nilai>
          <Nilai label="Tim">{b.pelaksana}</Nilai>
          <Nilai label="Lokasi">{b.alamat ?? "—"}</Nilai>
          <Nilai label="WO">{b.woLabel ? `${b.woLabel} · ${tanggal(b.woTgl)}` : "-"}</Nilai>
        </div>

        {b.lat !== null && b.lng !== null && (
          <a href={`https://www.google.com/maps?q=${b.lat},${b.lng}`} target="_blank" rel="noreferrer"
            className="flex w-fit items-center gap-1 text-xs font-semibold text-navy-600 hover:text-navy-500">
            <MapPin size={12} /> {b.lat}, {b.lng}
          </a>
        )}

        <div className="flex flex-wrap gap-3">
          <Foto url={b.fotoSebelum} label="Sebelum" />
          {b.fotoProses && <Foto url={b.fotoProses} label="Proses" />}
          <Foto url={b.fotoSesudah} label="Sesudah" />
        </div>

        {b.catatan && <Nilai label="Catatan">{b.catatan}</Nilai>}
        </>
        )}
      </ModalShell>

      {batal && (
        <BatalkanModal
          judul="Batalkan catatan pekerjaan PDKB ini?"
          keterangan={b.inspeksiId
            ? "Catatan tetap tersimpan dengan status Dibatalkan beserta alasannya. Tugas asalnya terbuka lagi (Ditugaskan), sehingga hasilnya bisa dicatat ulang."
            : "Catatan tetap tersimpan dengan status Dibatalkan beserta alasannya, dan tidak dihitung lagi."}
          labelTombol="Batalkan catatan"
          placeholder="Alasan — mis. salah penyulang, catatan ganda"
          onTutup={() => setBatal(false)}
          onBatalkan={async (alasan) => {
            try {
              await onBatalkan(b.id, alasan, oleh);
              toast.success("Catatan dibatalkan.");
              return true;
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal membatalkan.");
              return false;
            }
          }}
        />
      )}
    </>
  );
}
