"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Terminal } from "lucide-react";
import { BTN_GHOST, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { POSKO_MAP } from "../_lib/yantek";

/** Query GraphQL APKT untuk data yantek (1 baris, supaya bisa ditempel utuh). */
const GQL = `query detailCheckInCheckOutIndividu($dateFrom: Date!, $dateTo: Date!, $idPosko: [Int], $idUid: [Int], $idUp3: [Int], $personilYantek: String!, $userRegu: String!) { detailCheckInCheckOutIndividu(dateFrom: $dateFrom, dateTo: $dateTo, idPosko: $idPosko, idUid: $idUid, idUp3: $idUp3, personilYantek: $personilYantek, userRegu: $userRegu) { id id_uid nama_uid id_up3 nama_up3 id_posko nama_posko media pembuat_laporan dispatch_by durasi_waktu_dispatch user_regu nama_regu personil_yantek shift check_in_petugas no_laporan durasi_wo waktu_lapor waktu_dispatch waktu_perjalanan waktu_nyala_sementara waktu_nyala waktu_selesai waktu_response check_out_petugas durasi_menit_response durasi_menit_recovery rating jml_pelanggan_padam fasilitas sub_fasilitas peralatan dampak_kerusakan kelompok_penyebab cuaca keterangan_pelapor keterangan penyebab tindakan status_akhir referensi_marking blth durasi_menit_perjalanan } }`;

function buildSnippet(from: string, to: string, idPosko: number): string {
  const vars = {
    dateFrom: from,
    dateTo: to,
    idPosko: [idPosko],
    idUid: [44],
    idUp3: [441],
    // Dikosongkan = semua personil / semua regu.
    personilYantek: "",
    userRegu: "",
  };
  return `fetch("https://new-apktservice.pln.co.id:32183/graphql",{method:"POST",headers:{accept:"application/json","content-type":"application/json"},body:JSON.stringify({query:${JSON.stringify(GQL)},variables:${JSON.stringify(vars)}})}).then(r=>r.json()).then(d=>{const a=d.data.detailCheckInCheckOutIndividu;window.yantekData=JSON.stringify(a);console.log("✅ "+a.length+" baris siap. Sekarang ketik:  copy(yantekData)  lalu Enter, lalu paste di Smart.");}).catch(e=>console.error(e));`;
}

/** Tanggal hari ini & awal bulan, format YYYY-MM-DD. */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface KonsolPanelProps {
  /** ULP user; UP3 (null) bebas memilih posko. */
  unit: string | null;
}

export default function KonsolPanel({ unit }: KonsolPanelProps) {
  const hariIni = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => iso(new Date(hariIni.getFullYear(), hariIni.getMonth(), 1)));
  const [to, setTo] = useState(() => iso(hariIni));

  const poskoTersedia = unit ? POSKO_MAP.filter((p) => p.ulp === unit) : POSKO_MAP;
  const [idPosko, setIdPosko] = useState(poskoTersedia[0]?.idPosko ?? 441501);
  const [tersalin, setTersalin] = useState(false);
  /** Tertutup secara bawaan — perintahnya hanya dipakai sesekali saat menarik
   *  data, sementara ruang layar di halaman ini lebih berharga untuk dashboard. */
  const [buka, setBuka] = useState(false);

  const snippet = useMemo(() => buildSnippet(from, to, idPosko), [from, to, idPosko]);

  async function salin() {
    await navigator.clipboard.writeText(snippet);
    setTersalin(true);
    setTimeout(() => setTersalin(false), 1800);
  }

  return (
    <div className={CARD}>
      <button
        onClick={() => setBuka((b) => !b)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
        aria-expanded={buka}
      >
        <Terminal size={14} className="text-navy-600 shrink-0" />
        <span className="text-sm font-semibold text-ink">Perintah Console APKT</span>
        <span className="text-[11px] text-ink-muted truncate">
          — tarik data yantek dari APKT
        </span>
        <div className="flex-1" />
        <ChevronDown
          size={15}
          className={`shrink-0 text-ink-muted transition-transform ${buka ? "rotate-180" : ""}`}
        />
      </button>

      {!buka ? null : (
      <div className="px-4 pb-4 border-t border-line pt-3">
      <div className="flex items-center justify-end mb-3">
        <button onClick={salin} className={BTN_GHOST}>
          {tersalin ? <Check size={14} className="text-green-700" /> : <Copy size={14} />}
          {tersalin ? "Tersalin" : "Salin Perintah"}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <p className={EYEBROW}>Dari</p>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${FIELD} mt-1`} />
        </div>
        <div>
          <p className={EYEBROW}>Sampai</p>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${FIELD} mt-1`} />
        </div>
        <div>
          <p className={EYEBROW}>Posko</p>
          <select
            value={idPosko}
            onChange={(e) => setIdPosko(Number(e.target.value))}
            disabled={poskoTersedia.length === 1}
            className={`${FIELD} mt-1 cursor-pointer disabled:opacity-60`}
          >
            {poskoTersedia.map((p) => (
              <option key={p.idPosko} value={p.idPosko}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      <ol className="text-[11px] text-ink-soft space-y-1 mb-3 list-decimal list-inside">
        <li>Login ke APKT, lalu buka <b>DevTools → Console</b> (F12).</li>
        <li>Klik <b>Salin Perintah</b>, tempel di console, tekan Enter.</li>
        <li>
          Ketik <code className="px-1 py-0.5 rounded bg-surface border border-line font-mono">copy(yantekData)</code>{" "}
          lalu Enter — hasilnya masuk clipboard.
        </li>
        <li>Tempel di kotak <b>Paste JSON</b> di bawah, lalu Simpan.</li>
      </ol>

      <pre className="max-h-28 overflow-auto rounded-xl border border-line bg-surface p-3 text-[10px] font-mono text-ink-soft whitespace-pre-wrap break-all">
        {snippet}
      </pre>

      <p className="text-[11px] text-ink-muted mt-2">
        Hasil rentang tanggal otomatis dipecah per hari saat disimpan, memakai kolom{" "}
        <code className="font-mono">waktu_lapor</code>.
      </p>
      </div>
      )}
    </div>
  );
}
