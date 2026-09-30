"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { BTN_GHOST, FIELD } from "@/app/admin/_ui";
import type { ItemIsian, OpsiIsian, Syarat } from "../_hooks/useJtmIsian";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import SyaratJtm from "./SyaratJtm";

const TOMBOL = `${BTN_GHOST} h-8 px-2.5 text-xs`;
const TEMUAN = "text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100";

interface Props {
  i: ItemIsian;
  opsi: OpsiIsian[];
  semua: ItemIsian[];
  opsiPer: (kode: string) => OpsiIsian[];
  onUbahItem: (kode: string, patch: Record<string, unknown>) => Promise<boolean>;
  onUbahSyarat: (kode: string, s: Syarat) => Promise<boolean>;
  onSimpanOpsi: (o: Omit<OpsiIsian, "dariRef">) => Promise<boolean>;
  onTambahOpsi: (itemKode: string, label: string, normal: boolean) => Promise<boolean>;
  onHapusOpsi: (itemKode: string, kode: string) => Promise<boolean>;
}

export default function BarisItemJtm({ i, opsi, semua, opsiPer, onUbahItem, onUbahSyarat, onSimpanOpsi, onTambahOpsi, onHapusOpsi }: Props) {
  const [nama, setNama] = useState(i.nama);
  const [ubahSyarat, setUbahSyarat] = useState(false);
  const [syarat, setSyarat] = useState<Syarat>({ item: i.syaratItem, nilai: i.syaratNilai, negasi: i.syaratNegasi });
  const [baru, setBaru] = useState("");

  const namaPenentu = semua.find((x) => x.kode === i.syaratItem)?.nama ?? i.syaratItem;
  const labelSyarat = i.syaratNilai
    .map((v) => opsiPer(i.syaratItem ?? "").find((o) => o.kode === v)?.label ?? v)
    .join(" / ");

  return (
    <div className={`border-t border-line pt-3 ${i.aktif ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          onBlur={() => nama.trim() && nama !== i.nama && void onUbahItem(i.kode, { nama: nama.trim() })}
          className={`${FIELD} w-[230px] font-semibold`}
          aria-label={`Nama ${i.kode}`}
        />
        <span className="font-mono text-[11px] text-ink-muted" title="Kode — tersimpan di data, tidak bisa diubah">
          {i.kode}
        </span>
        <span className="text-[11px] text-ink-muted">
          {i.tipe}
          {i.dimensi === "fasa" ? " · per fasa" : ""}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => void onUbahItem(i.kode, { milik: i.milik === "tiang" ? "sirkit" : "tiang" })}
            className={TOMBOL}
            title="Pemilik tiang = hanya penyulang pemilik batang, tersembunyi di tiang underbuild. Tiap kabel = diisi juga oleh penyulang yang menumpang, untuk kabelnya sendiri."
          >
            {i.milik === "tiang" ? "Pemilik tiang" : "Tiap kabel"}
          </button>
          <button onClick={() => void onUbahItem(i.kode, { wajib: !i.wajib })} className={TOMBOL}>
            {i.wajib ? "Wajib" : "Tidak wajib"}
          </button>
          <button onClick={() => void onUbahItem(i.kode, { aktif: !i.aktif })} className={TOMBOL}>
            {i.aktif ? "Aktif" : "Nonaktif"}
          </button>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-ink-muted flex flex-wrap items-center gap-2">
        {ubahSyarat ? (
          <>
            <SyaratJtm nilai={syarat} onUbah={setSyarat} item={semua} opsiPer={opsiPer} kodeSendiri={i.kode} />
            <button
              onClick={async () => (await onUbahSyarat(i.kode, syarat)) && setUbahSyarat(false)}
              disabled={!!syarat.item && syarat.nilai.length === 0}
              className={`${TOMBOL} disabled:opacity-40`}
            >
              Simpan syarat
            </button>
          </>
        ) : (
          <>
            <span>
              {i.syaratItem ? (
                <>
                  hanya kalau <b className="text-ink">{namaPenentu}</b> {i.syaratNegasi ? "bukan" : "="} {labelSyarat}
                </>
              ) : (
                "selalu ditanyakan"
              )}
            </span>
            <button onClick={() => setUbahSyarat(true)} className="text-navy-600 font-semibold">
              ubah syarat
            </button>
          </>
        )}
      </div>

      {i.tipe === "pilihan" && (
        <div className="mt-2 ml-3 space-y-1.5">
          {opsi.map((o) => (
            <BarisOpsi key={o.kode} o={o} onSimpan={onSimpanOpsi} onHapus={() => onHapusOpsi(o.itemKode, o.kode)} />
          ))}
          {i.sumberOpsi ? (
            <p className="text-[11px] text-ink-muted">
              Daftarnya diatur di bagian <b>{i.sumberOpsi}</b> di bawah; di sini hanya tanda Normal/Temuan.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={baru}
                onChange={(e) => setBaru(e.target.value)}
                placeholder="Pilihan baru"
                className={`${FIELD} h-8 w-[200px]`}
              />
              {[true, false].map((normal) => (
                <button
                  key={String(normal)}
                  disabled={!baru.trim()}
                  onClick={async () => (await onTambahOpsi(i.kode, baru, normal)) && setBaru("")}
                  className={`${TOMBOL} disabled:opacity-40 ${normal ? "" : TEMUAN}`}
                >
                  <Plus size={13} /> {normal ? "Normal" : "Temuan"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BarisOpsi({
  o,
  onSimpan,
  onHapus,
}: {
  o: OpsiIsian;
  onSimpan: (o: Omit<OpsiIsian, "dariRef">) => Promise<boolean>;
  onHapus: () => Promise<boolean>;
}) {
  const [label, setLabel] = useState(o.label);
  const [tanyaHapus, setTanyaHapus] = useState(false);
  const simpan = (patch: Partial<OpsiIsian>) => void onSimpan({ ...o, label, ...patch });

  return (
    <div className={`flex flex-wrap items-center gap-2 ${o.aktif ? "" : "opacity-55"}`}>
      <input
        value={label}
        disabled={o.dariRef}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label.trim() && label !== o.label && simpan({})}
        className={`${FIELD} h-8 w-[200px] disabled:bg-surface`}
        aria-label={`Label ${o.kode}`}
      />
      <span className="font-mono text-[10px] text-ink-muted w-[90px] truncate" title={o.kode}>
        {o.kode}
      </span>
      <button onClick={() => simpan({ normal: !o.normal })} className={`${TOMBOL} ${o.normal ? "" : TEMUAN}`} title="Apakah jawaban ini sebuah temuan">
        {o.normal ? "Normal" : "Temuan"}
      </button>
      {!o.dariRef && (
        <>
          <button onClick={() => simpan({ aktif: !o.aktif })} className={TOMBOL}>
            {o.aktif ? "Aktif" : "Nonaktif"}
          </button>
          <button
            onClick={() => setTanyaHapus(true)}
            className="text-ink-muted hover:text-danger p-1"
            title="Hapus — ditolak kalau sudah dipakai catatan pemeriksaan"
            aria-label={`Hapus ${o.label}`}
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
      {tanyaHapus && (
        <ConfirmDialog
          title={`Hapus pilihan "${o.label}"?`}
          message="Pilihan hilang dari formulir HP. Kalau sudah dipakai catatan pemeriksaan, penghapusan ditolak — nonaktifkan saja supaya laporan lama tetap terbaca."
          confirmLabel="Hapus"
          tone="danger"
          onConfirm={() => {
            setTanyaHapus(false);
            void onHapus();
          }}
          onClose={() => setTanyaHapus(false)}
        />
      )}
    </div>
  );
}
