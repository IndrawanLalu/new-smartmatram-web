"use client";

import { useState, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { TiangJtm } from "../_hooks/useTiangJtm";

interface Props {
  tiang: TiangJtm[];
}

/** Nama tiang = satu elemen DOM yang ikut digambar ulang tiap peta digeser.
 *  Ratusan masih lancar, ribuan membuat peta tersendat saat sedang dipakai. */
const BATAS_NAMA = 400;

const CITRA =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const JALAN = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Dua hal diwarnai dengan DUA saluran berbeda, bukan satu.
 *
 * Isi lingkaran = sudah pernah dilihat orang di lapangan atau belum. Cincin
 * ungu = tiang dipikul lebih dari satu penyulang. Kalau keduanya dijejalkan ke
 * warna isi, tiang impor yang juga underbuild terpaksa memilih salah satu, dan
 * yang hilang justru keterangan yang paling jarang ada.
 */
const ISI_TERKONFIRMASI = "#2A4A9C";
const ISI_BELUM = "#94A3B8";
const CINCIN_BERSAMA = "#8E24AA";

export default function PetaJtmInner({ tiang }: Props) {
  const [satelit, setSatelit] = useState(false);
  const [tampilNama, setTampilNama] = useState(false);

  const berkoordinat = useMemo(
    () => tiang.filter((t) => t.lat !== null && t.lng !== null),
    [tiang],
  );
  const petaId = useMemo(() => new Map(tiang.map((t) => [t.id, t])), [tiang]);

  const tengah = useMemo<[number, number]>(() => {
    if (berkoordinat.length === 0) return [-8.58, 116.1];
    return [
      berkoordinat.reduce((s, t) => s + t.lat!, 0) / berkoordinat.length,
      berkoordinat.reduce((s, t) => s + t.lng!, 0) / berkoordinat.length,
    ];
  }, [berkoordinat]);

  return (
    <div className="relative h-full rounded-xl overflow-hidden border border-line">
      <MapContainer center={tengah} zoom={15} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          key={satelit ? "citra" : "jalan"}
          url={satelit ? CITRA : JALAN}
          maxZoom={19}
          attribution={satelit ? "&copy; Esri" : "&copy; OpenStreetMap"}
        />

        {/* Bentang: tiap tiang ke induknya. Tiang pangkal tidak menggambar
            apa-apa — ujung satunya peralatan hubung yang belum tentu bertitik. */}
        {berkoordinat.map((t) => {
          const induk = t.induk_id ? petaId.get(t.induk_id) : null;
          if (!induk || induk.lat === null || induk.lng === null) return null;
          return (
            <Polyline
              key={`r-${t.id}`}
              positions={[
                [induk.lat, induk.lng],
                [t.lat!, t.lng!],
              ]}
              pathOptions={{ color: "#38BDF8", weight: 3, opacity: 0.9 }}
            />
          );
        })}

        {berkoordinat.map((t) => {
          const bersama = t.penyulangLewat.length > 1;
          return (
            <CircleMarker
              key={t.id}
              center={[t.lat!, t.lng!]}
              radius={bersama ? 9 : 7}
              pathOptions={{
                color: bersama ? CINCIN_BERSAMA : "#fff",
                weight: bersama ? 3 : 2,
                fillColor: t.dikonfirmasi_at ? ISI_TERKONFIRMASI : ISI_BELUM,
                fillOpacity: 1,
              }}
            >
              {tampilNama && (
                <Tooltip permanent direction="right" offset={[9, 0]} className="tooltip-tiang">
                  {t.kode}
                </Tooltip>
              )}
              <Popup>
                <b>{t.kode}</b>
                {t.nomor_lama ? <> · nomor lama {t.nomor_lama}</> : null}
                <br />
                {t.penyulang}
                <br />
                {t.jenis ?? "jenis belum dicatat"}
                {t.konstruksi ? ` · ${t.konstruksi}` : ""}
                <br />
                {t.segmen.length > 0 ? (
                  <>Segmen: {t.segmen.join(" · ")}</>
                ) : (
                  <i>belum masuk segmen mana pun</i>
                )}
                {bersama && (
                  <>
                    <br />
                    Dipikul: {t.penyulangLewat.join(", ")}
                  </>
                )}
                <br />
                {t.dikonfirmasi_at ? (
                  <>Dikonfirmasi lapangan</>
                ) : (
                  <i>belum dikonfirmasi lapangan{t.sumber === "impor" ? " (dari impor)" : ""}</i>
                )}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="absolute top-2 right-2 z-[1000] flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setSatelit((s) => !s)}
          className="h-8 px-3 rounded-lg bg-white/95 border border-line text-xs font-semibold text-ink shadow-sm hover:bg-white"
        >
          {satelit ? "Peta jalan" : "Citra satelit"}
        </button>
        <button
          type="button"
          disabled={berkoordinat.length > BATAS_NAMA}
          title={
            berkoordinat.length > BATAS_NAMA
              ? `Terlalu banyak tiang (${berkoordinat.length}) untuk ditampilkan namanya sekaligus. Saring penyulangnya dulu.`
              : undefined
          }
          onClick={() => setTampilNama((v) => !v)}
          className={`h-8 px-3 rounded-lg border text-xs font-semibold shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            tampilNama
              ? "bg-navy-600 border-navy-600 text-white"
              : "bg-white/95 border-line text-ink hover:bg-white"
          }`}
        >
          {tampilNama ? "Sembunyikan nama" : "Nama tiang"}
        </button>
      </div>

      <div className="absolute bottom-2 left-2 z-[1000] flex flex-wrap items-center gap-3 rounded-lg bg-black/60 px-3 py-1.5 text-[11px] text-white">
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#2A4A9C] ring-1 ring-white" /> dikonfirmasi
          lapangan
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#94A3B8] ring-1 ring-white" /> belum
          dikonfirmasi
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#94A3B8] ring-2 ring-[#8E24AA]" /> dipikul
          banyak penyulang
        </span>
      </div>
    </div>
  );
}
