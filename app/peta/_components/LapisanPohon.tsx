"use client";

import { memo } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { fotoKecil } from "@/lib/fotoKecil";
import { WARNA_CEK, WARNA_POHON, type JenisPohon, type PohonCek, type PohonDirabas, type TemuanPohon } from "../_hooks/usePohonPeta";

/**
 * Lapisan pohon — ikon pohon (permintaan user 8 Okt 2026, bukan lingkaran).
 *
 * Ikon = elemen DOM (Leaflet tidak bisa menggambar bentuk pohon ke kanvas).
 * Aman: jumlahnya puluhan–ratusan, dan lapisannya padam saat halaman dibuka.
 * Enam varian ikon dibuat SEKALI dan dipakai ulang semua penanda, sama dengan
 * ikon gardu di PetaInner.
 *
 * Temuan inspeksi JTM berkoordinat TIANG — ikonnya digeser ke kanan-atas
 * tiang supaya tidak menutupi lingkaran tiangnya dan tetap bisa diklik
 * terpisah. Pohon yang sudah dirabas berdiri tepat di titik GPS-nya.
 */

const L_IKON = 18;
const T_IKON = 22;

const svgPohon = (warna: string, pudar: boolean) =>
  `<svg viewBox="0 0 18 22" width="${L_IKON}" height="${T_IKON}" xmlns="http://www.w3.org/2000/svg" style="opacity:${pudar ? 0.6 : 1};filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))">
    <rect x="7.5" y="13" width="3" height="8" rx="1" fill="#7C4A1E" stroke="#fff" stroke-width="0.6"/>
    <circle cx="9" cy="8" r="6.6" fill="${warna}" stroke="#fff" stroke-width="1.1" ${pudar ? 'stroke-dasharray="2.2 1.6"' : ""}/>
    <circle cx="6.2" cy="6.4" r="1.6" fill="rgba(255,255,255,.35)"/>
  </svg>`;

const ikon = (jenis: JenisPohon, pudar: boolean, geser: boolean) =>
  L.divIcon({
    className: "",
    iconSize: [L_IKON, T_IKON],
    // Kaki batang di koordinat; temuan digeser ke kanan-atas tiang.
    iconAnchor: geser ? [-3, T_IKON + 2] : [L_IKON / 2, T_IKON],
    popupAnchor: geser ? [L_IKON / 2 + 3, -T_IKON] : [0, -T_IKON],
    html: svgPohon(WARNA_POHON[jenis], pudar),
  });

const IKON = {
  menyentuh: { setuju: ikon("menyentuh", false, true), belum: ikon("menyentuh", true, true) },
  berpotensi: { setuju: ikon("berpotensi", false, true), belum: ikon("berpotensi", true, true) },
  dirabas: ikon("dirabas", false, false),
};

/** Pohon hasil pengecekan: segitiga merah berisi "!" — bentuk yang sama
 *  dengan di HP pengecek & regu, supaya tidak tertukar dengan pohon inspeksi. */
const IKON_CEK = L.divIcon({
  className: "",
  iconSize: [20, 18],
  iconAnchor: [10, 16],
  popupAnchor: [0, -16],
  html: `<svg viewBox="0 0 20 18" width="20" height="18" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))">
    <path d="M10 1.2 L19 16.8 L1 16.8 Z" fill="${WARNA_CEK}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="9.1" y="6" width="1.8" height="5.6" rx="0.9" fill="#fff"/><circle cx="10" cy="13.9" r="1.1" fill="#fff"/>
  </svg>`,
});

const tglId = (s: string | null) =>
  s ? new Date(s.length === 10 ? `${s}T00:00:00+08:00` : s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Makassar" }) : "—";
const jamId = (s: string) =>
  new Date(s).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" });

function Foto({ url, label }: { url: string | null; label: string }) {
  if (!url) return <div className="h-20 rounded bg-gray-100 grid place-items-center text-[10px] text-gray-400">{label}: —</div>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element -- foto Storage di popup Leaflet */}
      <img src={fotoKecil(url, 160)} alt={label} className="h-20 w-full object-cover rounded" />
      <span className="block text-[10px] text-gray-500 mt-0.5">{label}</span>
    </a>
  );
}

function IsiTemuan({ t, onTugaskan }: { t: TemuanPohon; onTugaskan?: (t: TemuanPohon) => void }) {
  return (
    <div className="text-xs w-[220px]">
      <p className="font-semibold text-sm" style={{ color: WARNA_POHON[t.vegetasi] }}>
        {t.vegetasi === "menyentuh" ? "Menyentuh jaringan" : "Berpotensi"}
        {t.jenisPohon ? ` · ${t.jenisPohon}` : ""}
      </p>
      <p className="mt-1">Tiang <b>{t.tiangKode}</b> · {t.penyulang}</p>
      <p className="text-gray-500">{t.segmen}</p>
      <p className="text-gray-500 mt-0.5">
        Inspeksi {tglId(t.tgl)} · {t.disetujui ? "disetujui" : "menunggu persetujuan"}
      </p>
      <p className="mt-0.5">
        {t.statusTugas === null
          ? <span className="text-gray-500">Belum bisa ditugaskan — inspeksinya belum disetujui</span>
          : t.statusTugas === "Belum ditugaskan"
            ? <b className="text-amber-700">Belum ditugaskan</b>
            : <b className="text-emerald-700">{t.statusTugas} · {t.regu ?? "—"}</b>}
      </p>
      {t.tertangani && <p className="mt-0.5 text-emerald-700 font-semibold">Segmennya sudah dirabas sesudah inspeksi ini</p>}
      {t.catatan && <p className="mt-1 italic text-gray-600">“{t.catatan}”</p>}
      {t.fotoUrl && <div className="mt-2"><Foto url={t.fotoUrl} label="Foto temuan" /></div>}
      {onTugaskan && t.kunciTugas && (
        <button
          onClick={() => onTugaskan(t)}
          className="mt-2 w-full rounded-lg bg-[#004D40] px-2 py-1.5 text-xs font-semibold text-white hover:bg-[#00695C]"
        >
          Tugaskan ke regu
        </button>
      )}
    </div>
  );
}

function IsiDirabas({ p }: { p: PohonDirabas }) {
  return (
    <div className="text-xs w-[240px]">
      <p className="font-semibold text-sm" style={{ color: WARNA_POHON.dirabas }}>
        Sudah dirabas{p.jenisPohon ? ` · ${p.jenisPohon}` : ""}
      </p>
      <p className="mt-1">{p.penyulang}{p.luarWo ? " · di luar WO" : ""}</p>
      {p.segmen && <p className="text-gray-500">{p.segmen}</p>}
      <p className="text-gray-500 mt-0.5">{jamId(p.waktu)} · {p.petugas ?? "—"}</p>
      {/* Sebelum & sesudah berdampingan: yang dinilai adalah bedanya (butir 7). */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Foto url={p.fotoSebelum} label="Sebelum" />
        <Foto url={p.fotoSesudah} label="Sesudah" />
      </div>
    </div>
  );
}

function IsiCek({ p }: { p: PohonCek }) {
  return (
    <div className="text-xs w-[240px]">
      <p className="font-semibold text-sm" style={{ color: WARNA_CEK }}>
        Belum dirabas · hasil pengecekan{p.jenisPohon ? ` · ${p.jenisPohon}` : ""}
      </p>
      <p className="mt-1">{p.penyulang}</p>
      {p.segmen && <p className="text-gray-500">{p.segmen}</p>}
      <p className="text-gray-500 mt-0.5">Dicek {jamId(p.waktu)} · {p.pengecek ?? "—"} · putaran {p.putaran}</p>
      {p.catatan && <p className="mt-1 italic text-gray-600">“{p.catatan}”</p>}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {p.foto.map((u, i) => <Foto key={u} url={u} label={i === 0 ? "Utama" : `Foto ${i + 1}`} />)}
      </div>
    </div>
  );
}

function LapisanPohon({
  temuan, dirabas, cek, onTugaskan,
}: {
  temuan: TemuanPohon[];
  dirabas: PohonDirabas[];
  cek: PohonCek[];
  /** Ada = pengguna boleh menugaskan (admin/UP3). */
  onTugaskan?: (t: TemuanPohon) => void;
}) {
  return (
    <>
      {temuan.map((t) => (
        <Marker key={`pt-${t.tiangId}`} position={[t.lat, t.lng]} icon={IKON[t.vegetasi][t.disetujui ? "setuju" : "belum"]}>
          <Popup><IsiTemuan t={t} onTugaskan={onTugaskan} /></Popup>
        </Marker>
      ))}
      {dirabas.map((p) => (
        <Marker key={`pd-${p.id}`} position={[p.lat, p.lng]} icon={IKON.dirabas}>
          <Popup><IsiDirabas p={p} /></Popup>
        </Marker>
      ))}
      {cek.map((p) => (
        <Marker key={`pc-${p.id}`} position={[p.lat, p.lng]} icon={IKON_CEK}>
          <Popup><IsiCek p={p} /></Popup>
        </Marker>
      ))}
    </>
  );
}

export default memo(LapisanPohon);
