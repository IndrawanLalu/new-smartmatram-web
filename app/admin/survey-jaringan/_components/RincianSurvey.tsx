"use client";

import { useEffect, useState } from "react";
import { Ban, Calculator, CheckCheck, FileDown, Loader2, Map as IkonPeta, RotateCcw, Save } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import TabelMaterial from "@/app/admin/_components/TabelMaterial";
import FotoSurvey from "./FotoSurvey";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import {
  LABEL_ALASAN, materialDariGambar, NADA_STATUS_SURVEY,
  type BarisMaterialSurvey, type SurveyJaringan, type TiangSambung, type TitikSurvey,
} from "@/lib/surveyJaringan";
import { bacaGambarSurvey, bacaLabelPenanda, type Pengesah, type SurveyJaringanState } from "../_hooks/useSurveyJaringan";
import { unduhGambarSurveyJtm } from "../_utils/unduhGambarSurveyJtm";

/** Rincian satu survey: angka, material (dihitung dari gambar, disunting), status, gambar survey PDF. */

interface Props {
  s: SurveyJaringan;
  boleh: boolean;
  oleh: string;
  st: SurveyJaringanState;
  onTutup: () => void;
}

/** Koordinat yang bisa disalin + tautan Google Maps. */
const Koordinat = ({ k }: { k: { lat: number; lng: number } }) => (
  <a href={`https://www.google.com/maps?q=${k.lat},${k.lng}`} target="_blank" rel="noopener" className="font-mono text-navy-600 hover:underline">
    {k.lat.toFixed(6)}, {k.lng.toFixed(6)}
  </a>
);

const kms = (m: number) => (m / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const tgl = (x: string | null) => (x ? new Date(x).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function RincianSurvey({ s, boleh, oleh, st, onTutup }: Props) {
  const toast = useToast();
  const [gambar, setGambar] = useState<{ titik: TitikSurvey[]; sambung: Map<string, TiangSambung> } | null>(null);
  const [penanda, setPenanda] = useState<Map<string, string>>(new Map());
  const [material, setMaterial] = useState<BarisMaterialSurvey[]>(s.material);
  const [catatan, setCatatan] = useState(s.catatan ?? "");
  const namaAwal: Pengesah = { digambar: s.digambar_nama ?? "", diperiksa: s.diperiksa_nama ?? "", disetujui: s.disetujui_nama ?? "" };
  const [nama, setNama] = useState<Pengesah>(namaAwal);
  const namaBerubah = JSON.stringify(nama) !== JSON.stringify(namaAwal);
  const [mode, setMode] = useState<"lihat" | "batal">("lihat");
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState<string | null>(null);
  const bisaUbah = boleh && (s.status === "Draf" || s.status === "Disetujui");
  const bisaNama = boleh && s.status !== "Batal";
  const berubah = JSON.stringify(material) !== JSON.stringify(s.material) || catatan !== (s.catatan ?? "");
  const label = (k: string) => penanda.get(k) ?? k;

  useEffect(() => {
    let hidup = true;
    Promise.all([bacaGambarSurvey(s.id), bacaLabelPenanda()])
      .then(([g, p]) => {
        if (!hidup) return;
        setGambar(g);
        setPenanda(p);
      })
      .catch((e: Error) => toast.error(e.message));
    return () => { hidup = false; };
  }, [s.id, toast]);

  const jalankan = async (kunci: string, f: () => Promise<unknown>, pesan: string) => {
    setSibuk(kunci);
    try {
      await f();
      if (pesan) toast.success(pesan);
      setMode("lihat");
    } catch (e) {
      toast.error(`${(e as Error).message}`);
    } finally {
      setSibuk(null);
    }
  };
  const putar = (k: string) => (sibuk === k ? <Loader2 size={14} className="animate-spin" /> : null);

  return (
    <ModalShell
      title={s.judul}
      subtitle={`${s.penyulang ?? "-"} · ULP ${s.ulp} · ${LABEL_ALASAN[s.alasan]} · disurvey ${s.dibuat_oleh ?? "-"}, ${tgl(s.dibuat_at)}`}
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {mode === "batal" ? (
            <>
              <button onClick={() => setMode("lihat")} className={`${BTN_GHOST} mr-auto`}>Kembali</button>
              <button
                disabled={!!sibuk || !alasan.trim()}
                onClick={() => void jalankan("batal", () => st.batalkan(s.id, alasan, oleh), "Survey dibatalkan.")}
                className={`${BTN_PRIMARY} bg-red-600! hover:bg-red-700!`}
              >
                {putar("batal") ?? <Ban size={14} />} Batalkan survey
              </button>
            </>
          ) : (
            <>
              <a href={`/peta?survey=${s.id}`} target="_blank" rel="noopener" className={BTN_GHOST}>
                <IkonPeta size={14} /> {s.status === "Draf" && boleh ? "Ubah gambar di peta" : "Lihat di peta"}
              </a>
              <button
                disabled={!gambar || !!sibuk}
                onClick={() =>
                  void jalankan("pdf", () => unduhGambarSurveyJtm(
                    { ...s, material, catatan: catatan || null, digambar_nama: nama.digambar || null, diperiksa_nama: nama.diperiksa || null, disetujui_nama: nama.disetujui || null },
                    gambar!.titik, gambar!.sambung, label,
                  ), "")
                }
                className={`${BTN_GHOST} mr-auto`}
              >
                {putar("pdf") ?? <FileDown size={14} />} Gambar survey
              </button>
              {bisaUbah && <button onClick={() => setMode("batal")} className={`${BTN_GHOST} text-red-600`}><Ban size={14} /> Batalkan</button>}
              {((bisaUbah && berubah) || (bisaNama && namaBerubah)) && (
                <button
                  disabled={!!sibuk}
                  onClick={() =>
                    void jalankan("simpan", async () => {
                      if (bisaUbah && berubah) await st.ubahMaterial(s.id, material, catatan, oleh);
                      if (bisaNama && namaBerubah) await st.ubahPengesah(s.id, nama, oleh);
                    }, "Tersimpan.")
                  }
                  className={BTN_GHOST}
                >
                  {putar("simpan") ?? <Save size={14} />} Simpan perubahan
                </button>
              )}
              {boleh && s.status === "Disetujui" && (
                <button disabled={!!sibuk} onClick={() => void jalankan("buka", () => st.buka(s.id, oleh), "Survey kembali ke Draf.")} className={BTN_GHOST}>
                  {putar("buka") ?? <RotateCcw size={14} />} Buka kembali ke Draf
                </button>
              )}
              {boleh && s.status === "Draf" && (
                <button
                  disabled={!!sibuk || berubah || namaBerubah}
                  title={berubah || namaBerubah ? "Simpan perubahan dulu" : undefined}
                  onClick={() => void jalankan("setujui", () => st.setujui(s.id, oleh), "Survey disetujui.")}
                  className={BTN_PRIMARY}
                >
                  {putar("setujui") ?? <CheckCheck size={14} />} Setujui
                </button>
              )}
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${NADA_STATUS_SURVEY[s.status]}`}>{s.status}</span>
          <span className="text-ink">
            JTM <b>{s.jumlah_tiang_jtm}</b> tiang · <b>{kms(s.panjang_jtm_m)}</b> kms
            {s.jumlah_gardu > 0 && <> · <b>{s.jumlah_gardu}</b> gardu baru ({s.gardu_kva} kVA)</>}
            {(s.jumlah_tiang_jtr > 0 || s.panjang_jtr_m > 0) && <> · JTR <b>{s.jumlah_tiang_jtr}</b> tiang · <b>{kms(s.panjang_jtr_m)}</b> kms</>}
          </span>
        </div>
        {s.status === "Batal" && <p className="text-sm text-ink-soft">Dibatalkan: {s.batal_alasan ?? "-"}</p>}
        {s.disetujui_at && <p className="text-sm text-ink-soft">Disetujui {s.disetujui_oleh ?? "-"}, {tgl(s.disetujui_at)}</p>}

        <div className="space-y-1.5">
          <TabelMaterial isi={material} onUbah={bisaUbah && mode === "lihat" ? setMaterial : undefined} />
          {bisaUbah && mode === "lihat" && (
            <button
              disabled={!gambar}
              onClick={() => setMaterial(materialDariGambar(gambar!.titik, gambar!.sambung, label))}
              className="inline-flex items-center gap-1 text-xs font-semibold text-navy-600 hover:underline disabled:opacity-40"
            >
              <Calculator size={13} /> Hitung dari gambar (mengganti daftar di atas)
            </button>
          )}
          <p className="text-xs text-ink-muted">
            Dari gambar: konduktor JTM kawat ×3 fasa, kabel berinti tiga ×1; kabel JTR pilin (LVTC/Twisted) ×1, telanjang ×4; +3% andongan; tiang JTM/JTR, konstruksi, peralatan, dan trafo dihitung per titik.
          </p>
        </div>

        <FotoSurvey s={s} boleh={bisaNama} onUbah={(f) => st.ubahFoto(s.id, f, oleh)} />

        {gambar && (
          <section className="space-y-1">
            <p className={EYEBROW}>Koordinat lokasi</p>
            <ul className="text-sm space-y-0.5">
              {[...gambar.sambung.values()].map((x) => (
                <li key={x.id}><span className="text-ink-soft">Sambung {x.kode ?? ""}:</span> <Koordinat k={x} /></li>
              ))}
              {gambar.titik.map((t, i) =>
                t.penanda ? (
                  <li key={t.id}>
                    <span className="text-ink-soft">{t.penanda === "gardu" ? `Gardu ${t.gardu_jenis ?? ""}` : label(t.penanda)} T{i + 1}:</span> <Koordinat k={t} />
                  </li>
                ) : null,
              )}
            </ul>
          </section>
        )}

        <label className="block space-y-1.5">
          <span className={EYEBROW}>Catatan</span>
          {bisaUbah && mode === "lihat" ? (
            <textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={2} className={`${FIELD} w-full h-auto py-2`} />
          ) : (
            <p className="text-sm text-ink">{catatan || "—"}</p>
          )}
        </label>

        <section className="space-y-1.5">
          <p className={EYEBROW}>Nama di blok judul gambar survey</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {([["digambar", "Di gbr/Survai", s.dibuat_oleh ?? ""], ["diperiksa", "Diperiksa", ""], ["disetujui", "Disetujui", ""]] as const).map(([k, l, ph]) => (
              <label key={k} className="block space-y-1">
                <span className="text-xs text-ink-soft">{l}</span>
                <input
                  value={nama[k]} disabled={!bisaNama || mode !== "lihat"} placeholder={ph || "nama"}
                  onChange={(e) => setNama((n) => ({ ...n, [k]: e.target.value }))}
                  className={`${FIELD} w-full`}
                />
              </label>
            ))}
          </div>
        </section>

        {mode === "batal" && (
          <label className="block space-y-1.5">
            <span className={EYEBROW}>Alasan pembatalan</span>
            <input value={alasan} onChange={(e) => setAlasan(e.target.value)} autoFocus placeholder="mis. tidak jadi dibangun tahun ini" className={`${FIELD} w-full`} />
          </label>
        )}
      </div>
    </ModalShell>
  );
}
