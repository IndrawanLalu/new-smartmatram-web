"use client";

import { useState } from "react";
import { X, MapPin, Route, Circle, Loader2 } from "lucide-react";
import { totalDistanceM } from "../_hooks/usePetaGardu";
import type { Gardu, Jalur, Tiang, FeatureType } from "../_hooks/types";

const INPUT_CLS =
  "border border-[#1e3552] rounded-lg px-2.5 py-1.5 text-sm text-[#e2e8f0] bg-[#0d1b2a] focus:outline-none focus:border-[#00897B] focus:ring-1 focus:ring-[#00897B]/20 w-full";
const LABEL_CLS = "block text-xs text-gray-400 mb-1";
const ULP_OPTIONS = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={LABEL_CLS}>
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

interface Props {
  mode: "add" | "edit";
  featureType: FeatureType;
  initialData: Gardu | Jalur | Tiang | null;
  initialLatLng: [number, number] | null;
  drawnPoints: [number, number][];
  jalurList: Jalur[];
  userUnit: string | null;
  isUP3: boolean;
  onClose: () => void;
  onSaved: () => void;
  insertGardu?: (data: Omit<Gardu, "beban_kva" | "beban_persen" | "beban_total"> & Partial<Pick<Gardu, "beban_kva" | "beban_persen" | "beban_total">>) => Promise<void>;
  updateGardu?: (kode: string, data: Partial<Gardu>) => Promise<void>;
  insertJalur: (data: Omit<Jalur, "id" | "koordinat" | "jarak">, points: [number, number][]) => Promise<void>;
  updateJalur: (id: string, data: Partial<Omit<Jalur, "id" | "koordinat">>, points?: [number, number][]) => Promise<void>;
  insertTiang: (data: Omit<Tiang, "id">) => Promise<void>;
  updateTiang: (id: string, data: Partial<Tiang>) => Promise<void>;
}

const FORM_ID = "peta-feature-form";

export default function FeatureForm({
  mode, featureType, initialData, initialLatLng, drawnPoints, jalurList,
  userUnit, isUP3, onClose, onSaved,
  insertGardu, updateGardu, insertJalur, updateJalur, insertTiang, updateTiang,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const title =
    mode === "add"
      ? featureType === "gardu" ? "Tambah Gardu"
        : featureType === "jalur" ? "Simpan Jalur"
        : "Tambah Tiang"
      : featureType === "gardu" ? "Edit Gardu"
        : featureType === "jalur" ? "Edit Jalur"
        : "Edit Tiang";

  const Icon = featureType === "gardu" ? MapPin : featureType === "jalur" ? Route : Circle;

  const g = featureType === "gardu" ? (initialData as Gardu | null) : null;
  const j = featureType === "jalur" ? (initialData as Jalur | null) : null;
  const t = featureType === "tiang" ? (initialData as Tiang | null) : null;

  const defaultLat = initialLatLng?.[0] ?? g?.lat ?? t?.lat ?? "";
  const defaultLng = initialLatLng?.[1] ?? g?.lng ?? t?.lng ?? "";
  const defaultUlp = (!isUP3 && userUnit) ? userUnit : "";

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const fd = new FormData(e.currentTarget);
      const get = (k: string) => (fd.get(k) as string ?? "").trim();
      const getNum = (k: string) => { const v = get(k); return v ? Number(v) : null; };

      if (featureType === "gardu") {
        const kode = get("kode");
        const lat = Number(get("lat")); const lng = Number(get("lng"));
        if (!kode) { setErr("Kode gardu wajib diisi"); return; }
        if (!lat || !lng) { setErr("Koordinat tidak valid"); return; }
        const data = {
          kode, nama: get("nama"),
          alamat: get("alamat") || null, feeder: get("feeder") || null,
          daya: getNum("daya"), merk: get("merk") || null,
          status: get("status") || null, ulp: get("ulp") || null,
          tgl_update: new Date().toISOString().slice(0, 10),
          lat, lng,
        };
        if (mode === "add") await insertGardu?.(data);
        else await updateGardu?.(g!.kode, data);

      } else if (featureType === "jalur") {
        const nama = get("nama"); const feeder = get("feeder");
        if (!nama) { setErr("Nama jalur wajib diisi"); return; }
        if (!feeder) { setErr("Feeder wajib diisi"); return; }
        if (mode === "add" && drawnPoints.length < 2) { setErr("Jalur butuh minimal 2 titik"); return; }
        const data = {
          nama: nama || null, feeder: feeder || null,
          penghantar: get("penghantar") || null, status: get("status") || null,
          warna: get("warna") || null, ulp: get("ulp") || null,
        };
        if (mode === "add") await insertJalur(data, drawnPoints);
        else await updateJalur(j!.id, data);

      } else {
        if (!get("kode")) { setErr("Kode tiang wajib diisi"); return; }
        const data = {
          kode: get("kode"), jenis: get("jenis") || null,
          tinggi: getNum("tinggi"), kondisi: get("kondisi") || null,
          feeder: get("feeder") || null, jalur_id: get("jalur_id") || null,
          alamat: get("alamat") || null, lat: Number(get("lat")), lng: Number(get("lng")),
          ulp: get("ulp") || null, tgl_pasang: get("tgl_pasang") || null,
          catatan: get("catatan") || null,
        };
        if (mode === "add") await insertTiang(data);
        else await updateTiang(t!.id, data);
      }
      onSaved();
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message
        : (ex && typeof ex === "object" && "message" in ex) ? String((ex as {message: unknown}).message)
        : String(ex) || "Gagal menyimpan";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  const jarakM = drawnPoints.length >= 2 ? totalDistanceM(drawnPoints) : null;

  return (
    <div className="fixed inset-y-0 right-0 w-85 bg-[#0a1628] border-l border-[#1e3552] z-500 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e3552] shrink-0">
        <Icon size={15} className="text-[#00897B]" />
        <span className="text-sm font-semibold text-[#e2e8f0] flex-1">{title}</span>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Form body */}
      <form id={FORM_ID} onSubmit={handleSave} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {featureType === "gardu" && (
          <>
            <Field label="Kode" required><input name="kode" defaultValue={g?.kode} className={INPUT_CLS} placeholder="GD-001" /></Field>
            <Field label="Nama"><input name="nama" defaultValue={g?.nama} className={INPUT_CLS} placeholder="Nama / alamat gardu" /></Field>
            <Field label="Feeder"><input name="feeder" defaultValue={g?.feeder ?? ""} className={INPUT_CLS} /></Field>
            <Field label="Daya (KVA)"><input name="daya" type="number" defaultValue={g?.daya ?? ""} className={INPUT_CLS} placeholder="160" /></Field>
            <Field label="Merk"><input name="merk" defaultValue={g?.merk ?? ""} className={INPUT_CLS} placeholder="TRAFINDO, UNINDO..." /></Field>
            <Field label="Status">
              <select name="status" defaultValue={g?.status ?? "Aktif"} className={INPUT_CLS}>
                <option value="">-</option>
                <option value="Aktif">Aktif</option>
                <option value="Tidak Aktif">Tidak Aktif</option>
                <option value="Pemeliharaan">Pemeliharaan</option>
              </select>
            </Field>
            {isUP3
              ? <Field label="ULP"><select name="ulp" defaultValue={g?.ulp ?? defaultUlp} className={INPUT_CLS}><option value="">-</option>{ULP_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}</select></Field>
              : <input type="hidden" name="ulp" value={defaultUlp} />
            }
            <Field label="Alamat"><input name="alamat" defaultValue={g?.alamat ?? ""} className={INPUT_CLS} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Latitude" required><input name="lat" type="number" step="any" defaultValue={String(defaultLat)} className={INPUT_CLS} /></Field>
              <Field label="Longitude" required><input name="lng" type="number" step="any" defaultValue={String(defaultLng)} className={INPUT_CLS} /></Field>
            </div>
          </>
        )}

        {featureType === "jalur" && (
          <>
            <Field label="Nama Jalur" required><input name="nama" defaultValue={j?.nama ?? ""} className={INPUT_CLS} placeholder="Nama jalur / segmen" /></Field>
            <Field label="Feeder" required><input name="feeder" defaultValue={j?.feeder ?? ""} className={INPUT_CLS} /></Field>
            <Field label="Penghantar"><input name="penghantar" defaultValue={j?.penghantar ?? ""} className={INPUT_CLS} placeholder="AAAC 150, XLPE 70..." /></Field>
            <Field label="Status">
              <select name="status" defaultValue={j?.status ?? "Normal"} className={INPUT_CLS}>
                <option value="Normal">Normal</option>
                <option value="Warning">Warning</option>
                <option value="Gangguan">Gangguan</option>
              </select>
            </Field>
            <Field label="Warna Garis"><input name="warna" type="color" defaultValue={j?.warna ?? "#00897B"} className="h-9 w-full rounded-lg border border-[#1e3552] bg-[#0d1b2a] cursor-pointer" /></Field>
            {isUP3
              ? <Field label="ULP"><select name="ulp" defaultValue={j?.ulp ?? defaultUlp} className={INPUT_CLS}><option value="">-</option>{ULP_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}</select></Field>
              : <input type="hidden" name="ulp" value={defaultUlp} />
            }
            {jarakM != null && (
              <div className="bg-[#162334] border border-[#1e3552] rounded-lg px-3 py-2 text-xs text-gray-400">
                Panjang: <span className="text-[#5eead4] font-mono font-semibold">
                  {jarakM >= 1000 ? `${(jarakM / 1000).toFixed(2)} km` : `${jarakM.toFixed(0)} m`}
                </span>
                <span className="text-gray-600 ml-2">({drawnPoints.length} titik)</span>
              </div>
            )}
          </>
        )}

        {featureType === "tiang" && (
          <>
            <Field label="Kode Tiang" required><input name="kode" defaultValue={t?.kode ?? ""} className={INPUT_CLS} placeholder="T-001" /></Field>
            <Field label="Jenis">
              <select name="jenis" defaultValue={t?.jenis ?? ""} className={INPUT_CLS}>
                <option value="">-</option>
                <option value="Beton">Beton</option>
                <option value="Besi">Besi</option>
                <option value="Kayu">Kayu</option>
              </select>
            </Field>
            <Field label="Tinggi (m)"><input name="tinggi" type="number" step="0.1" defaultValue={t?.tinggi ?? ""} className={INPUT_CLS} placeholder="9" /></Field>
            <Field label="Kondisi">
              <select name="kondisi" defaultValue={t?.kondisi ?? "Baik"} className={INPUT_CLS}>
                <option value="Baik">Baik</option>
                <option value="Retak">Retak</option>
                <option value="Miring">Miring</option>
                <option value="Rusak">Rusak</option>
              </select>
            </Field>
            <Field label="Feeder"><input name="feeder" defaultValue={t?.feeder ?? ""} className={INPUT_CLS} /></Field>
            <Field label="Jalur">
              <select name="jalur_id" defaultValue={t?.jalur_id ?? ""} className={INPUT_CLS}>
                <option value="">- Tidak ada -</option>
                {jalurList.map((jl) => <option key={jl.id} value={jl.id}>{jl.nama ?? jl.id.slice(0, 8)}</option>)}
              </select>
            </Field>
            {isUP3
              ? <Field label="ULP"><select name="ulp" defaultValue={t?.ulp ?? defaultUlp} className={INPUT_CLS}><option value="">-</option>{ULP_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}</select></Field>
              : <input type="hidden" name="ulp" value={defaultUlp} />
            }
            <Field label="Alamat"><input name="alamat" defaultValue={t?.alamat ?? ""} className={INPUT_CLS} /></Field>
            <Field label="Tgl Pasang"><input name="tgl_pasang" type="date" defaultValue={t?.tgl_pasang ?? ""} className={INPUT_CLS} /></Field>
            <Field label="Catatan"><textarea name="catatan" defaultValue={t?.catatan ?? ""} className={`${INPUT_CLS} resize-none`} rows={2} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Latitude" required><input name="lat" type="number" step="any" defaultValue={String(defaultLat)} className={INPUT_CLS} /></Field>
              <Field label="Longitude" required><input name="lng" type="number" step="any" defaultValue={String(defaultLng)} className={INPUT_CLS} /></Field>
            </div>
          </>
        )}

      </form>

      {/* Footer */}
      <div className="px-4 pt-2 pb-3 border-t border-[#1e3552] flex flex-col gap-2 shrink-0">
        {err && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
        <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 border border-[#1e3552] hover:bg-white/5 transition-colors">
          Batal
        </button>
        <button
          type="submit"
          form={FORM_ID}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-linear-to-r from-[#004D40] to-[#00897B] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? "Menyimpan..." : "Simpan"}
        </button>
        </div>
      </div>
    </div>
  );
}
