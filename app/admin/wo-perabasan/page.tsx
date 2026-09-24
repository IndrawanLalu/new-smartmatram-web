"use client";

import { useState } from "react";
import { Download, LayoutDashboard, ListChecks, Loader2, Search, Send, TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { useWoPerabasan } from "./_hooks/useWoPerabasan";
import { useDaftarPerabasan, BULAN, STATUS_RABAS } from "./_hooks/useDaftarPerabasan";
import TabelRabas from "./_components/TabelRabas";
import DetailRabasModal from "./_components/DetailRabasModal";
import DashboardPerabasan from "./_components/DashboardPerabasan";
import TerbitkanWo from "./_components/TerbitkanWo";

/**
 * Perabasan Pohon — satuan SEGMEN, ukuran KILOMETER.
 *
 * Pola halaman Kinerja Pelayanan Teknik (teknisaplikasi.md butir 7):
 * Daftar Segmen → Dashboard → Susun WO. Persetujuan bukan tab lagi, melainkan
 * chip "Menunggu verifikasi" di daftar; keputusannya di modal detail.
 *
 * WO boleh terbit kapan saja dan memuat segmen dari beberapa penyulang — ruas
 * 7 km dan ruas 0,3 km bukan pekerjaan yang sama, jadi ukurannya km.
 */

const TABS = [
  { key: "daftar", label: "Daftar Segmen", icon: ListChecks },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "terbit", label: "Susun WO", icon: Send },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function WoPerabasanPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  const [idDetail, setIdDetail] = useState<string | null>(null);
  const [mengunduh, setMengunduh] = useState(false);
  const w = useWoPerabasan();
  const d = useDaftarPerabasan(user);
  const oleh = user.name ?? user.email;

  const detail = idDetail ? (d.semua.find((b) => b.id === idDetail) ?? null) : null;

  /** Aksi dari modal: jalankan, lalu tambal baris itu saja di daftar. */
  const lalu = (id: string) => async (ok: boolean) => {
    if (ok) await d.segarkanSatu(id);
    return ok;
  };

  const unduh = async () => {
    setMengunduh(true);
    try {
      const { unduhExcelPerabasan } = await import("./_lib/unduhExcel");
      const periode = d.bulan === 0 ? `${d.tahun}` : `${d.tahun}-${String(d.bulan).padStart(2, "0")}`;
      await unduhExcelPerabasan(d.baris, `Perabasan_${d.ulp === "SEMUA" ? "SemuaULP" : d.ulp}_${periode}.xlsx`);
    } finally {
      setMengunduh(false);
    }
  };

  const dashboard = tab === "dashboard";

  return (
    <div className="text-ink flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`${CHIP} ${tab === key ? CHIP_ON : CHIP_OFF}`}>
            <Icon size={14} />
            {label}
            {key === "daftar" && !d.loading && d.hitung["Belum ditugaskan"] > 0 && (
              <span
                className={`tabular-nums text-[10px] px-1.5 rounded-full ${tab === key ? "bg-white/20" : "bg-red-100 text-red-700"}`}
                title="Segmen belum ditugaskan ke regu mana pun — tidak muncul di HP siapa pun"
              >
                {d.hitung["Belum ditugaskan"]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "terbit" ? (
        <TerbitkanWo
          user={user}
          segmen={w.segmen}
          segmenTerikat={w.segmenTerikat}
          regu={w.regu}
          woTerbuka={w.wo.filter((x) => x.status === "Terbit")}
          onTerbitkan={async (v) => {
            const h = await w.terbitkan({ ...v, oleh });
            if (h) d.muat();
            return h;
          }}
          onTambah={async (v) => {
            const h = await w.tambahKeWo({ ...v, oleh });
            if (h) d.muat();
            return h;
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={d.ulp}
              onChange={(e) => d.setUlp(e.target.value)}
              className={`${FIELD} w-[170px]`}
              disabled={d.daftarUlp.length <= 1}
              aria-label="ULP"
            >
              {d.daftarUlp.map((u) => <option key={u} value={u}>{u === "SEMUA" ? "Semua ULP" : u}</option>)}
            </select>
            {!dashboard && (
              <select value={d.bulan} onChange={(e) => d.setBulan(Number(e.target.value))} className={`${FIELD} w-[160px]`} aria-label="Bulan">
                <option value={0}>Sepanjang tahun</option>
                {BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
              </select>
            )}
            <select value={d.tahun} onChange={(e) => d.setTahun(Number(e.target.value))} className={`${FIELD} w-[100px]`} aria-label="Tahun">
              {d.daftarTahun.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {!dashboard && (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  value={d.cari}
                  onChange={(e) => d.setCari(e.target.value)}
                  placeholder="Cari penyulang / segmen / regu / WO"
                  className={`${FIELD} w-[250px] pl-8`}
                />
              </div>
            )}
          </div>

          {!dashboard && (
            <>
              <div className="flex flex-wrap items-center gap-2 -mt-1">
                <button onClick={() => d.setStatus("SEMUA")} className={`${CHIP} ${d.status === "SEMUA" ? CHIP_ON : CHIP_OFF}`}>
                  Semua
                </button>
                {STATUS_RABAS.map((s) => (
                  <button key={s} onClick={() => d.setStatus(s)} className={`${CHIP} ${d.status === s ? CHIP_ON : CHIP_OFF}`}>
                    {s} <span className="opacity-70">{d.loading ? "" : d.hitung[s]}</span>
                  </button>
                ))}
                <button
                  onClick={() => void unduh()}
                  disabled={d.loading || !!d.galat || d.baris.length === 0 || mengunduh}
                  title="Mengunduh baris yang sedang tampil di tabel"
                  className="ml-auto flex items-center gap-1.5 h-8 px-3 rounded-lg bg-navy-600 text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {mengunduh ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  Download XLSX
                </button>
              </div>
              <p className="text-[11px] text-ink-muted -mt-2">
                Segmen yang masih berjalan selalu tampil, berapa pun umur WO-nya — itu tunggakan. Periode
                menyaring yang sudah diverifikasi (menurut tanggal selesai) dan yang dibatalkan.
              </p>
            </>
          )}

          {dashboard ? (
            <DashboardPerabasan key={`${d.ulp}-${d.tahun}`} ulp={d.ulp} tahun={d.tahun} />
          ) : d.galat && !d.loading ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-semibold text-amber-800">Daftar gagal dimuat</p>
                <p className="mt-0.5 text-amber-700">{d.galat} — kosongnya tabel bukan berarti tidak ada pekerjaan.</p>
                <button onClick={d.muat} className="mt-2 font-semibold text-navy-600 hover:text-navy-500">Muat ulang</button>
              </div>
            </div>
          ) : (
            <TabelRabas baris={d.baris} loading={d.loading} onDetail={(b) => setIdDetail(b.id)} />
          )}
        </>
      )}

      {detail && (
        <DetailRabasModal
          b={detail}
          regu={w.regu}
          onTutup={() => setIdDetail(null)}
          onTugaskan={(id, regu) => w.tugaskanRegu(id, regu, oleh).then(lalu(id))}
          onPutuskan={(id, terima, catatan) => w.putuskan(id, terima, catatan, oleh).then(lalu(id))}
          onBatalkan={(id, alasan) => w.batalkanItem(id, alasan, oleh).then(lalu(id))}
          ambilRealisasi={w.ambilRealisasi}
        />
      )}
    </div>
  );
}
