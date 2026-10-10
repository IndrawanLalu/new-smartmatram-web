"use client";

import type { MilikPenanda } from "@/lib/milikPenanda";
import { useState } from "react";
import { Loader2, Move, Navigation, TriangleAlert, X } from "lucide-react";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { jarakMeter, tautanArah } from "@/lib/geo";
import type { PilihanAtribut, RincianGardu, RincianTiang, Terpilih } from "../_hooks/useObjekPeta";
import type { Penanda } from "../_hooks/usePenandaJtm";
import { GARIS, INPUT, JUDUL_BAGIAN, PANEL } from "../_ui";
import InfoTiang, { Baris, TOMBOL_PANEL } from "./InfoTiang";
import RingkasSimulasi from "./RingkasSimulasi";
import RincianKesehatan from "./RincianKesehatan";
import KoreksiJtr from "./KoreksiJtr";
import PersetujuanJtrPeta from "./PersetujuanJtrPeta";
import type { AntreanJtr } from "../_hooks/useAntreanJtr";
import type { Banding } from "@/app/admin/jtr/_hooks/useApprovalJtr";
import type { HasilSimulasi } from "../_hooks/useSimulasiBuka";

/**
 * Panel kanan: rincian benda yang diklik di peta, dan — untuk admin ULP-nya
 * sendiri & UP3 — suntingannya. Semua suntingan beralasan dan tercatat di
 * master_audit (`scripts/peta-sunting.sql`).
 */

interface Props {
  terpilih: Terpilih;
  tiang: RincianTiang | null;
  gardu: RincianGardu | null;
  galat: string | null;
  pilihan: PilihanAtribut;
  penanda: Map<string, Penanda>;
  boleh: boolean;
  geser: { lat: number; lng: number } | null;
  onMulaiGeser: () => void;
  onBatalGeser: () => void;
  onSimpanGeser: (alasan: string) => Promise<boolean>;
  modeInduk: boolean;
  onGantiInduk: () => void;
  /** Mode pilih induk di penyulang yang menumpang (null = induk batang). */
  indukPenyulang: string | null;
  onIndukPenyulang: (penyulang: string) => void;
  onIkutBatang: () => Promise<boolean>;
  onBatalInduk: () => void;
  onUbahAtribut: (isi: Record<string, string>) => Promise<boolean>;
  onPercabangan: (nyala: boolean) => Promise<boolean>;
  onBuatPasangan: () => Promise<boolean>;
  onNamaBerubah: () => void;
  /** Tiang bersama berpenanda: pemilik peralatannya (null = bukan tiang bersama). */
  milikPenanda: MilikPenanda | null;
  onPemilikPeralatan: (penyulang: string | null) => Promise<boolean>;
  onBatalkan: (alasan: string) => Promise<boolean>;
  onTutup: () => void;
  simulasi: HasilSimulasi | null;
  simulasiSibuk: boolean;
  onSimulasi: () => void;
  onTutupSimulasi: () => void;
  /** Koreksi JTR (tiang dipilih dari lapisan JTR). */
  alasanInduk: string;
  onAlasanInduk: (v: string) => void;
  onPangkalGardu: () => Promise<boolean>;
  onNamaJtr: (kode: string) => Promise<boolean>;
  onKabelJtr: (lama: number, baru: number, jenis: string, ukuran: string, hilir: boolean) => Promise<boolean>;
  onAsalJtr: (nomor: number, huluId: string | null, dariGardu: boolean) => Promise<boolean>;
  onJurusanKabelJtr: (nomor: number, jurusan: string) => Promise<boolean>;
  onJurusanJtr: (jurusan: string, hilir: boolean) => Promise<boolean>;
  /** Inspeksi JTR gardu ini yang menunggu persetujuan (null = tidak ada). */
  inspeksiJtr: AntreanJtr | null;
  oleh: string;
  onDiputuskan: () => void;
  onSorot: (b: Banding | null) => void;
  modeGabung: boolean;
  onMulaiGabung: () => void;
  onBatalGabung: () => void;
  onLepasTumpang: (alasan: string) => Promise<boolean>;
}

export default function PanelObjek(p: Props) {
  const { terpilih, tiang, gardu, galat, boleh, geser } = p;
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [tanyaBatal, setTanyaBatal] = useState(false);
  const [tanyaLepas, setTanyaLepas] = useState(false);

  const jarak = geser ? jarakMeter(terpilih.lat, terpilih.lng, geser.lat, geser.lng) : 0;
  const memuat = !galat && !tiang && !gardu;

  const simpanGeser = async () => {
    setSibuk(true);
    const ok = await p.onSimpanGeser(alasan);
    setSibuk(false);
    if (ok) setAlasan("");
  };

  return (
    <aside
      className="absolute z-[1100] top-14 right-3 bottom-3 w-[330px] max-w-[calc(100%-1.5rem)] rounded-xl border shadow-2xl flex flex-col"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <div className="flex items-start gap-2 px-4 pt-3 pb-2 border-b" style={{ borderColor: GARIS }}>
        <div className="flex-1 min-w-0">
          <p className={JUDUL_BAGIAN}>{terpilih.jenis === "tiang" ? "Tiang" : "Gardu"}</p>
          <p className="text-[#e2e8f0] font-semibold text-base truncate">{terpilih.kode}</p>
        </div>
        <a
          href={tautanArah(terpilih.lat, terpilih.lng)}
          target="_blank"
          rel="noreferrer"
          className="p-1.5 rounded-lg text-gray-400 hover:text-[#5eead4] hover:bg-white/5"
          title="Arahkan ke sini (Google Maps)"
        >
          <Navigation size={16} />
        </a>
        <button onClick={p.onTutup} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5" aria-label="Tutup">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {galat && <p className="text-xs text-red-300">{galat}</p>}
        {memuat && (
          <p className="text-xs text-gray-400 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Memuat…</p>
        )}

        {p.simulasi && terpilih.jenis === "tiang" && p.simulasi.alat.id === terpilih.id && (
          <RingkasSimulasi h={p.simulasi} onTutup={p.onTutupSimulasi} />
        )}

        {/* ── Menggeser ── */}
        {geser && (
          <div className="rounded-lg border border-[#00897B] p-3 space-y-2">
            <p className="text-xs text-[#e2e8f0]">
              Seret lingkaran hijau ke posisi yang benar.
              <span className="block text-[#5eead4] font-semibold mt-1">Bergeser {Math.round(jarak)} m</span>
            </p>
            <input
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="Alasan — wajib, mis. titik GPS meleset ke jalan"
              className={INPUT}
            />
            <div className="flex gap-2">
              <button
                onClick={() => void simpanGeser()}
                disabled={sibuk || !alasan.trim() || jarak < 0.5}
                className={`${TOMBOL_PANEL} border-[#00897B] text-[#5eead4]`}
              >
                {sibuk ? <Loader2 size={13} className="animate-spin" /> : <Move size={13} />} Simpan titik
              </button>
              <button onClick={p.onBatalGeser} disabled={sibuk} className={TOMBOL_PANEL}>Batal</button>
            </div>
          </div>
        )}

        {p.modeInduk && (
          <div className="rounded-lg border border-amber-500/60 p-3 text-xs text-amber-200 space-y-2">
            {tiang?.jtr ? (
              <>
                <p>
                  Klik tiang JTR gardu <b>{tiang.jtr.gardu}</b> yang menjadi <b>induk</b> baru tiang ini — atau
                  jadikan pangkal langsung dari gardu.
                </p>
                <input
                  value={p.alasanInduk}
                  onChange={(e) => p.onAlasanInduk(e.target.value)}
                  placeholder="Alasan — wajib, mis. salah sambung di lapangan"
                  className={INPUT}
                />
                <button
                  onClick={() => void p.onPangkalGardu()}
                  disabled={!p.alasanInduk.trim() || !tiang.jtr.indukKode}
                  className={TOMBOL_PANEL}
                >
                  Jadikan pangkal (langsung dari gardu)
                </button>
              </>
            ) : p.indukPenyulang ? (
              <>
                <p>
                  Klik tiang <b>{p.indukPenyulang}</b> yang menyambung ke tiang ini — lapisan {p.indukPenyulang} harus
                  menyala. Induk di penyulang pemilik tidak berubah.
                </p>
                <button onClick={() => void p.onIkutBatang()} className={TOMBOL_PANEL}>
                  Ikut induk batang
                </button>
              </>
            ) : (
              <p>Klik tiang di peta yang menjadi <b>induk</b> baru tiang ini.</p>
            )}
            <button onClick={p.onBatalInduk} className={TOMBOL_PANEL}>Batal</button>
          </div>
        )}

        {p.modeGabung && (
          <div className="rounded-lg border border-pink-400/60 p-3 text-xs text-pink-100 space-y-2">
            <p>
              Klik <b>batang aslinya</b> di peta — tiang JTM atau tiang JTR gardu lain di tempat yang sama. Tiang ini lalu
              menjadi pinjaman batang itu: nama, induk, kabel, dan tiang sesudahnya ikut; batang kembarnya dibatalkan.
            </p>
            <button onClick={p.onBatalGabung} className={TOMBOL_PANEL}>Batal</button>
          </div>
        )}

        {tiang?.jtr && !geser && !p.modeInduk && !p.modeGabung && (
          <KoreksiJtr
            key={`${tiang.jtr.gardu}-${tiang.jtr.kode}-${tiang.jtr.kabel.map((k) => k.nomor).join("")}`}
            j={tiang.jtr}
            pilihan={p.pilihan}
            boleh={boleh}
            onGantiInduk={p.onGantiInduk}
            onNama={p.onNamaJtr}
            onKabel={p.onKabelJtr}
            onAsal={p.onAsalJtr}
            onJurusanKabel={p.onJurusanKabelJtr}
            onJurusan={p.onJurusanJtr}
            onGabung={p.onMulaiGabung}
            onLepas={() => setTanyaLepas(true)}
          />
        )}

        {tiang && !geser && !p.modeInduk && !p.modeGabung && (
          <InfoTiang
            t={tiang}
            pilihan={p.pilihan}
            penanda={p.penanda}
            boleh={boleh}
            onUbahAtribut={p.onUbahAtribut}
            onGeser={p.onMulaiGeser}
            onGantiInduk={p.onGantiInduk}
            onIndukPenyulang={p.onIndukPenyulang}
            onPercabangan={p.onPercabangan}
            onBuatPasangan={p.onBuatPasangan}
            oleh={p.oleh}
            onNamaBerubah={p.onNamaBerubah}
            milik={p.milikPenanda}
            onPemilikPeralatan={p.onPemilikPeralatan}
            onBatalkan={() => setTanyaBatal(true)}
            onSimulasi={p.onSimulasi}
            simulasiSibuk={p.simulasiSibuk}
            tanpaGantiInduk={!!tiang.jtr}
          />
        )}

        {gardu && !geser && p.inspeksiJtr && boleh && (
          <PersetujuanJtrPeta
            key={p.inspeksiJtr.id}
            d={p.inspeksiJtr}
            oleh={p.oleh}
            onDiputuskan={p.onDiputuskan}
            onSorot={p.onSorot}
          />
        )}

        {gardu && !geser && (
          <div className="space-y-4">
            <div>
              <Baris label="Nama" nilai={gardu.nama} />
              <Baris label="Alamat" nilai={gardu.alamat} />
              <Baris label="Penyulang" nilai={gardu.feeder} />
              <Baris label="ULP" nilai={gardu.ulp} />
              <Baris label="Daya" nilai={gardu.daya === null ? null : `${gardu.daya} kVA`} />
            </div>
            {gardu.kesehatan && <RincianKesehatan k={gardu.kesehatan} />}
            {gardu.usulanTitikMenunggu && (
              <p className="text-xs text-amber-300 flex gap-2">
                <TriangleAlert size={14} className="shrink-0 mt-0.5" />
                Ada usulan titik dari lapangan yang menunggu persetujuan. Putuskan dulu di Pengukuran Gardu →
                Persetujuan sebelum menggeser.
              </p>
            )}
            {boleh && (
              <button onClick={p.onMulaiGeser} disabled={gardu.usulanTitikMenunggu} className={TOMBOL_PANEL}>
                <Move size={13} /> Geser titik
              </button>
            )}
          </div>
        )}

        {!boleh && (tiang || gardu) && (
          <p className="text-[11px] text-gray-500">Menyunting dari peta hanya untuk admin ULP ini dan UP3.</p>
        )}
      </div>

      {tanyaLepas && tiang?.jtr && (
        <BatalkanModal
          judul={`Lepas ${tiang.jtr.kode} dari batang ini?`}
          keterangan={`Untuk JTR gardu ${tiang.jtr.gardu} yang ternyata TIDAK lewat batang ini. Batangnya sendiri tidak berubah.`}
          peringatan="Ditolak kalau masih ada tiang JTR gardu ini yang menyambung dari sini — pindahkan induknya dulu."
          labelTombol="Lepas dari batang"
          placeholder="Alasan — mis. salah pilih batang saat menumpang"
          onTutup={() => setTanyaLepas(false)}
          onBatalkan={async (a) => {
            const ok = await p.onLepasTumpang(a);
            if (ok) setTanyaLepas(false);
            return ok;
          }}
        />
      )}

      {tanyaBatal && tiang && (
        <BatalkanModal
          judul={`Batalkan ${tiang.kode}?`}
          keterangan="Untuk tiang yang SALAH DIMASUKKAN — salah ketuk atau titik ganda. Tiang yang memang dicabut di lapangan bukan dibatalkan di sini."
          peringatan="Nama tiang ini dibuang dan nomornya bisa dipakai tiang lain. Ditolak kalau masih ada tiang yang menyambung dari sini."
          labelTombol="Batalkan tiang"
          placeholder="Alasan — mis. titik ganda dengan tiang sebelahnya"
          onTutup={() => setTanyaBatal(false)}
          onBatalkan={async (a) => {
            const ok = await p.onBatalkan(a);
            if (ok) setTanyaBatal(false);
            return ok;
          }}
        />
      )}
    </aside>
  );
}
