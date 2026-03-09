"use client";

import { X, ZoomIn, Pencil, Trash2, MapPin, Route, Circle } from "lucide-react";
import type { SelectedFeature, Gardu, Jalur, Tiang } from "../_hooks/types";

interface Props {
  feature: SelectedFeature;
  jalurList: Jalur[];
  onClose: () => void;
  onZoomTo: () => void;
  onEdit: () => void;
  onDeleteJalur: (id: string) => Promise<void>;
  onDeleteTiang: (id: string) => Promise<void>;
}

const ROW = "flex justify-between items-start gap-2 py-1.5 border-b border-[#1e3552]/50 last:border-0";
const LABEL = "text-[11px] text-gray-500 shrink-0";
const VALUE = "text-[11px] text-[#e2e8f0] text-right font-mono";

function AttrRow({ label, value }: { label: string; value: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      <span className={VALUE}>{value}</span>
    </div>
  );
}

export default function AttributePanel({
  feature,
  jalurList,
  onClose,
  onZoomTo,
  onEdit,
  onDeleteJalur,
  onDeleteTiang,
}: Props) {
  const handleDelete = async () => {
    const label = feature.type === "jalur" ? "jalur" : "tiang";
    if (!confirm(`Hapus ${label} ini? Tindakan ini tidak bisa dibatalkan.`)) return;
    if (feature.type === "jalur") await onDeleteJalur(feature.id);
    else await onDeleteTiang(feature.id);
    onClose();
  };

  const typeIcon =
    feature.type === "gardu" ? <MapPin size={13} className="text-[#00897B]" />
    : feature.type === "jalur" ? <Route size={13} className="text-[#00897B]" />
    : <Circle size={13} className="text-[#00897B]" />;

  const typeLabel =
    feature.type === "gardu" ? "Gardu"
    : feature.type === "jalur" ? "Jalur"
    : "Tiang";

  const d = feature.data;

  return (
    <div className="w-[280px] shrink-0 bg-[#0a1628] border-l border-[#1e3552] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#1e3552]">
        {typeIcon}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">{typeLabel}</div>
          <div className="text-sm text-[#e2e8f0] font-semibold truncate">
            {"kode" in d ? d.kode : ("nama" in d ? d.nama ?? feature.id.slice(0, 8) : feature.id.slice(0, 8))}
          </div>
        </div>
        <button
          onClick={onZoomTo}
          title="Zoom ke fitur"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-[#5eead4] hover:bg-[#00897B]/10 transition-colors"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Attributes */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {feature.type === "gardu" && (
          <GarduAttrs gardu={d as Gardu} />
        )}
        {feature.type === "jalur" && (
          <JalurAttrs jalur={d as Jalur} />
        )}
        {feature.type === "tiang" && (
          <TiangAttrs tiang={d as Tiang} jalurList={jalurList} />
        )}
      </div>

      {/* Actions — gardu bersifat read-only (dari spreadsheet) */}
      {feature.type !== "gardu" && (
        <div className="px-3 py-2.5 border-t border-[#1e3552] flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#00897B]/20 text-[#5eead4] hover:bg-[#00897B]/30 border border-[#00897B]/30 transition-colors"
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
          >
            <Trash2 size={12} /> Hapus
          </button>
        </div>
      )}
    </div>
  );
}

function GarduAttrs({ gardu }: { gardu: Gardu }) {
  const iNominal = gardu.kva_trafo
    ? (gardu.kva_trafo * 1000) / (Math.sqrt(3) * 400)
    : null;
  const hasArus = gardu.pengukuran_arus_r != null;
  const maxArus = hasArus
    ? Math.max(gardu.pengukuran_arus_r ?? 0, gardu.pengukuran_arus_s ?? 0, gardu.pengukuran_arus_t ?? 0)
    : null;
  const isPhaseOverload = iNominal != null && maxArus != null && maxArus >= iNominal;
  const isPhaseWarn = !isPhaseOverload && iNominal != null && maxArus != null && maxArus >= iNominal * 0.9;

  return (
    <div>
      <AttrRow label="Kode" value={gardu.kode} />
      <AttrRow label="Lokasi" value={gardu.nama} />
      <AttrRow label="Penyulang" value={gardu.feeder} />
      <AttrRow label="ULP" value={gardu.ulp} />
      <AttrRow label="Daya" value={gardu.daya != null ? `${gardu.daya} KVA` : null} />
      {!gardu.tgl_pengukuran && (
        <div className={ROW}>
          <span className={LABEL}>Pengukuran</span>
          <span className="text-[10px] font-semibold text-gray-500 italic">Belum diukur</span>
        </div>
      )}
      {gardu.beban_persen != null && (
        <div className={ROW}>
          <span className={LABEL}>Beban</span>
          <span className={`text-[11px] font-mono font-bold ${
            gardu.beban_persen >= 80 ? "text-red-400"
            : gardu.beban_persen >= 60 ? "text-amber-400"
            : "text-emerald-400"
          }`}>
            {gardu.beban_persen.toFixed(1)}%
          </span>
        </div>
      )}
      <AttrRow label="Beban KVA" value={gardu.beban_kva != null ? `${gardu.beban_kva.toFixed(1)} KVA` : null} />
      {hasArus && (
        <div className={ROW}>
          <span className={LABEL}>Arus R/S/T</span>
          <span className="text-[11px] font-mono text-[#e2e8f0]">
            {(gardu.pengukuran_arus_r ?? 0).toFixed(0)} / {(gardu.pengukuran_arus_s ?? 0).toFixed(0)} / {(gardu.pengukuran_arus_t ?? 0).toFixed(0)} A
          </span>
        </div>
      )}
      {iNominal != null && (
        <AttrRow label="I-Nominal" value={`${iNominal.toFixed(0)} A (${gardu.kva_trafo} KVA)`} />
      )}
      {(isPhaseOverload || isPhaseWarn) && (
        <div className={ROW}>
          <span className={LABEL}>Status Fasa</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            isPhaseOverload ? "bg-orange-500/20 text-orange-400" : "bg-amber-500/20 text-amber-400"
          }`}>
            {isPhaseOverload ? "OVERLOAD 1 FASA" : "WARNING 1 FASA"}
          </span>
        </div>
      )}
      <AttrRow label="Tgl Pengukuran" value={gardu.tgl_pengukuran ?? null} />
      <AttrRow label="Alamat" value={gardu.alamat} />
      <div className={ROW}>
        <span className={LABEL}>Koordinat</span>
        <span className={`${VALUE} text-[10px]`}>
          {gardu.lat.toFixed(6)}, {gardu.lng.toFixed(6)}
        </span>
      </div>
    </div>
  );
}

function JalurAttrs({ jalur }: { jalur: Jalur }) {
  const jarakDisplay = jalur.jarak != null
    ? jalur.jarak >= 1000
      ? `${(jalur.jarak / 1000).toFixed(2)} km (${jalur.jarak.toFixed(0)} m)`
      : `${jalur.jarak.toFixed(0)} m`
    : null;

  return (
    <div>
      <AttrRow label="ID" value={jalur.id.slice(0, 12) + "..."} />
      <AttrRow label="Nama" value={jalur.nama} />
      <AttrRow label="Feeder" value={jalur.feeder} />
      <AttrRow label="ULP" value={jalur.ulp} />
      <AttrRow label="Penghantar" value={jalur.penghantar} />
      <AttrRow label="Status" value={jalur.status} />
      <AttrRow label="Panjang" value={jarakDisplay} />
      <AttrRow label="Titik" value={jalur.koordinat.length} />
      {jalur.warna && (
        <div className={ROW}>
          <span className={LABEL}>Warna</span>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border border-white/20" style={{ backgroundColor: jalur.warna }} />
            <span className={`${VALUE} text-[10px]`}>{jalur.warna}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TiangAttrs({ tiang, jalurList }: { tiang: Tiang; jalurList: Jalur[] }) {
  const linkedJalur = tiang.jalur_id
    ? jalurList.find((j) => j.id === tiang.jalur_id)
    : null;

  return (
    <div>
      <AttrRow label="Kode" value={tiang.kode} />
      <AttrRow label="Jenis" value={tiang.jenis} />
      <AttrRow label="Tinggi" value={tiang.tinggi != null ? `${tiang.tinggi} m` : null} />
      <AttrRow label="Kondisi" value={tiang.kondisi} />
      <AttrRow label="Feeder" value={tiang.feeder} />
      <AttrRow label="ULP" value={tiang.ulp} />
      {linkedJalur && <AttrRow label="Jalur" value={linkedJalur.nama ?? linkedJalur.id.slice(0, 8)} />}
      <AttrRow label="Alamat" value={tiang.alamat} />
      <AttrRow label="Tgl Pasang" value={tiang.tgl_pasang} />
      <AttrRow label="Catatan" value={tiang.catatan} />
      <div className={ROW}>
        <span className={LABEL}>Koordinat</span>
        <span className={`${VALUE} text-[10px]`}>
          {tiang.lat.toFixed(6)}, {tiang.lng.toFixed(6)}
        </span>
      </div>
    </div>
  );
}
