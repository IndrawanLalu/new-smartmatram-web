"use client";

import { useState, useMemo, useRef } from "react";
import {
  MapContainer, TileLayer, CircleMarker, Polyline, Popup, Rectangle, Tooltip, useMapEvents,
} from "react-leaflet";
import type { LatLngBoundsExpression, LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TiangJtm } from "../_hooks/useTiangJtm";

interface Props {
  tiang: TiangJtm[];
  /** "tandai" menyalakan penarikan kotak dan ketuk-untuk-memilih. */
  mode: "lihat" | "tandai";
  terpilih: Set<string>;
  onUbahPilihan: (ids: string[], cara: "ganti" | "alih") => void;
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

/** Warna segmen saat menandai. Yang BELUM bersegmen sengaja abu pucat — dia
 *  yang sedang dicari, jadi harus paling mudah dibedakan dari yang sudah. */
const WARNA_SEGMEN = ["#1D3573", "#00695C", "#B3701A", "#8E24AA", "#C62828", "#2E7D32"];
const BELUM_BERSEGMEN = "#CBD5E1";
const DIPILIH = "#F59E0B";

/**
 * Penarik kotak.
 *
 * Leaflet tidak membawa alat pilih-area, dan menambah pustaka gambar hanya
 * untuk satu persegi panjang itu berlebihan. Yang dibutuhkan cuma tiga
 * kejadian tetikus — dan menonaktifkan geser peta selagi menarik, kalau tidak
 * petanya ikut bergeser dan kotaknya tidak pernah selesai.
 */
function KotakPilih({
  aktif,
  onSelesai,
}: {
  aktif: boolean;
  onSelesai: (batas: [[number, number], [number, number]], tambah: boolean) => void;
}) {
  const [awal, setAwal] = useState<[number, number] | null>(null);
  const [kini, setKini] = useState<[number, number] | null>(null);
  const tambahRef = useRef(false);

  const peta = useMapEvents({
    mousedown(e: LeafletMouseEvent) {
      if (!aktif) return;
      tambahRef.current = e.originalEvent.shiftKey || e.originalEvent.ctrlKey;
      peta.dragging.disable();
      setAwal([e.latlng.lat, e.latlng.lng]);
      setKini([e.latlng.lat, e.latlng.lng]);
    },
    mousemove(e: LeafletMouseEvent) {
      if (!aktif || !awal) return;
      setKini([e.latlng.lat, e.latlng.lng]);
    },
    mouseup() {
      if (!aktif) return;
      peta.dragging.enable();
      if (awal && kini) {
        const jauh =
          Math.abs(awal[0] - kini[0]) > 0.00002 || Math.abs(awal[1] - kini[1]) > 0.00002;
        if (jauh) {
          onSelesai(
            [
              [Math.min(awal[0], kini[0]), Math.min(awal[1], kini[1])],
              [Math.max(awal[0], kini[0]), Math.max(awal[1], kini[1])],
            ],
            tambahRef.current,
          );
        }
      }
      setAwal(null);
      setKini(null);
    },
  });

  if (!aktif || !awal || !kini) return null;
  const batas: LatLngBoundsExpression = [
    [Math.min(awal[0], kini[0]), Math.min(awal[1], kini[1])],
    [Math.max(awal[0], kini[0]), Math.max(awal[1], kini[1])],
  ];
  return (
    <Rectangle
      bounds={batas}
      pathOptions={{ color: DIPILIH, weight: 2, fillColor: DIPILIH, fillOpacity: 0.12 }}
    />
  );
}

export default function PetaJtmInner({ tiang, mode, terpilih, onUbahPilihan }: Props) {
  const [satelit, setSatelit] = useState(false);
  const [tampilNama, setTampilNama] = useState(false);

  const berkoordinat = useMemo(
    () => tiang.filter((t) => t.lat !== null && t.lng !== null),
    [tiang],
  );
  const petaId = useMemo(() => new Map(tiang.map((t) => [t.id, t])), [tiang]);

  /** Warna per segmen, dibagikan menurut urutan kemunculan. */
  const warnaSegmen = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tiang) {
      for (const id of t.segmenIds) {
        if (!m.has(id)) m.set(id, WARNA_SEGMEN[m.size % WARNA_SEGMEN.length]);
      }
    }
    return m;
  }, [tiang]);

  const tengah = useMemo<[number, number]>(() => {
    if (berkoordinat.length === 0) return [-8.58, 116.1];
    return [
      berkoordinat.reduce((s, t) => s + t.lat!, 0) / berkoordinat.length,
      berkoordinat.reduce((s, t) => s + t.lng!, 0) / berkoordinat.length,
    ];
  }, [berkoordinat]);

  const dalamKotak = (batas: [[number, number], [number, number]], tambah: boolean) => {
    const [[lat1, lng1], [lat2, lng2]] = batas;
    const kena = berkoordinat
      .filter((t) => t.lat! >= lat1 && t.lat! <= lat2 && t.lng! >= lng1 && t.lng! <= lng2)
      .map((t) => t.id);
    onUbahPilihan(kena, tambah ? "alih" : "ganti");
  };

  return (
    <div className="relative h-full rounded-xl overflow-hidden border border-line">
      <MapContainer
        center={tengah}
        zoom={15}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          key={satelit ? "citra" : "jalan"}
          url={satelit ? CITRA : JALAN}
          maxZoom={19}
          attribution={satelit ? "&copy; Esri" : "&copy; OpenStreetMap"}
        />

        <KotakPilih aktif={mode === "tandai"} onSelesai={dalamKotak} />

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
          const dipilih = terpilih.has(t.id);
          const menandai = mode === "tandai";

          const isi = dipilih
            ? DIPILIH
            : menandai
              ? (warnaSegmen.get(t.segmenIds[0] ?? "") ?? BELUM_BERSEGMEN)
              : t.dikonfirmasi_at
                ? ISI_TERKONFIRMASI
                : ISI_BELUM;

          return (
            <CircleMarker
              key={t.id}
              center={[t.lat!, t.lng!]}
              radius={dipilih ? 9 : bersama ? 8 : 6}
              eventHandlers={
                menandai ? { click: () => onUbahPilihan([t.id], "alih") } : undefined
              }
              pathOptions={{
                color: bersama ? CINCIN_BERSAMA : dipilih ? "#92400E" : "#fff",
                weight: bersama ? 3 : 2,
                fillColor: isi,
                fillOpacity: 1,
              }}
            >
              {tampilNama && (
                <Tooltip permanent direction="right" offset={[9, 0]} className="tooltip-tiang">
                  {t.kode}
                </Tooltip>
              )}
              {!menandai && (
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
              )}
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
        {mode === "tandai" ? (
          <>
            <span className="flex items-center gap-1.5">
              <i className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] ring-1 ring-white" /> terpilih
            </span>
            <span className="flex items-center gap-1.5">
              <i className="w-2.5 h-2.5 rounded-full bg-[#CBD5E1] ring-1 ring-white" /> belum
              bersegmen
            </span>
            <span className="flex items-center gap-1.5">
              <i className="w-2.5 h-2.5 rounded-full bg-[#1D3573] ring-1 ring-white" /> sudah
              bersegmen (warna per segmen)
            </span>
            <span className="text-white/70">tarik kotak · Shift menambah · ketuk mengalihkan</span>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
