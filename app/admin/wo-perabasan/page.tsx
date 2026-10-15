"use client";

import { useState } from "react";
import Link from "next/link";
import { Ban, Download, FileText, LayoutDashboard, ListChecks, Loader2, Map, Send, TreeDeciduous, TriangleAlert } from "lucide-react";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits } from "@/lib/roles";
import { nadaStatus } from "@/lib/statusUi";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import IsiTopbar from "@/app/admin/_kit/IsiTopbar";
import TabPil, { type ItemTab } from "@/app/admin/_kit/TabPil";
import { KotakCari } from "@/app/admin/_kit/Field";
import ChipSaring, { type ItemChip } from "@/app/admin/_kit/ChipSaring";
import CatatanInfo from "@/app/admin/_kit/CatatanInfo";
import Tombol from "@/app/admin/_kit/Tombol";
import { TabelKosong } from "@/app/admin/_kit/Tabel";
import { useWoPerabasan } from "./_hooks/useWoPerabasan";
import { useDaftarPerabasan, STATUS_RABAS, type BarisRabas, type SaringStatus } from "./_hooks/useDaftarPerabasan";
import TabelRabas from "./_components/TabelRabas";
import DetailRabasModal from "./_components/DetailRabasModal";
import TugaskanReguModal from "./_components/TugaskanReguModal";
import DashboardPerabasan from "./_components/DashboardPerabasan";
import SusunWoSegmen, { type IstilahWo } from "@/app/admin/_components/SusunWoSegmen";
import TabelLuarWo from "./_components/TabelLuarWo";
import DetailLuarWoModal from "./_components/DetailLuarWoModal";
import { useLuarWoPerabasan } from "./_hooks/useLuarWoPerabasan";
import DaftarWo from "./_components/DaftarWo";
import DetailWoModal from "./_components/DetailWoModal";
import { useSlaBulanan } from "@/app/admin/_hooks/useSlaBulanan";
import { PilihPeriode, PilihTahun, PilihUlp } from "@/app/admin/_kit/Saringan";

/**
 * Perabasan Pohon — satuan SEGMEN, ukuran KILOMETER.
 *
 * Pola halaman Kinerja Pelayanan Teknik (teknisaplikasi.md butir 7):
 * Daftar Segmen → Dashboard → Daftar WO → Susun WO. Persetujuan bukan tab,
 * melainkan chip "Menunggu verifikasi" di daftar; keputusannya di modal rincian.
 *
 * UI baru (rencana-ui-baru.md, 14 Okt 2026): kepala halaman dari kerangka
 * admin — tab dititipkan lewat IsiKepala, saringan lewat IsiTopbar.
 *
 * Rabas DI LUAR WO (tanpa segmen, tanpa km — keputusan user 25 Sep 2026)
 * tampil lewat chip "Di luar WO"; diperiksa admin ULP lokasi.
 */

const ISTILAH: IstilahWo = {
  judul: "Susun WO perabasan",
  contohNama: "Perabasan Oktober 2026",
  reguWajib: true,
  reguKosong: (ulp) =>
    `ULP ${ulp} belum punya regu rabas yang aktif di Manajemen Petugas (grup PERABASAN). WO tetap bisa terbit, tapi segmennya tidak akan muncul di HP siapa pun sampai regunya didaftarkan lalu ditugaskan dari daftar segmen.`,
};

type TabKey = "daftar" | "dashboard" | "wo" | "terbit";
type Chip = SaringStatus | "LUAR";

const kmTeks = (v: number) => v.toFixed(2).replace(".", ",");

export default function WoPerabasanPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  const [idDetail, setIdDetail] = useState<string | null>(null);
  const [idRegu, setIdRegu] = useState<string | null>(null);
  const [mengunduh, setMengunduh] = useState(false);
  const [lihatLuar, setLihatLuar] = useState(false);
  const [idLuar, setIdLuar] = useState<string | null>(null);
  const [idWo, setIdWo] = useState<string | null>(null);
  /** Segmen yang dicentang untuk dikeluarkan dari WO sekaligus. */
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [keluarkan, setKeluarkan] = useState(false);
  /** Dibuka dari Daftar WO → Susun WO langsung pada "Tambah ke WO" ini. */
  const [woAwal, setWoAwal] = useState<{ id: string; ulp: string } | null>(null);
  const slaBulan = useSlaBulanan("perabasan");
  const w = useWoPerabasan();
  const d = useDaftarPerabasan(user);
  const l = useLuarWoPerabasan(d.ulp, d.tahun, d.bulan, d.cari);
  const oleh = user.name ?? user.email;

  // Modal membaca data hidup: kunci baris, dicari dari daftar LENGKAP.
  const detail = idDetail ? (d.semua.find((b) => b.id === idDetail) ?? null) : null;
  const barisRegu = idRegu ? (d.semua.find((b) => b.id === idRegu) ?? null) : null;
  const detailLuar = idLuar ? (l.semua.find((b) => b.id === idLuar) ?? null) : null;
  const detailWo = idWo ? (w.wo.find((x) => x.wo_id === idWo) ?? null) : null;
  const bolehUlp = (u: string) =>
    canSeeAllUnits(user.role) || (user.role === "admin" && (user.unit ?? "").toUpperCase() === u.toUpperCase());

  /** SLA bulan WO + KMS WO yang SUDAH terbit di bulan itu untuk ULP tsb. */
  const infoSla = (u: string, tglWo: string) => ({
    sla: slaBulan(u, tglWo),
    terbit: w.wo
      .filter((x) => x.ulp === u && x.status !== "Dibatalkan" && x.tgl_wo.slice(0, 7) === tglWo.slice(0, 7))
      .reduce((n, x) => n + Number(x.rencana_km ?? 0), 0),
  });

  // Hanya yang BELUM dikerjakan regu boleh dikeluarkan (dijaga database juga).
  const bisaPilih = (b: BarisRabas) => b.statusDb === "Dijadwalkan" && bolehUlp(b.ulp);
  const dipilih = d.baris.filter((b) => pilih.has(b.id) && bisaPilih(b));
  const ubahPilih = (id: string[], aktif: boolean) =>
    setPilih((p) => {
      const n = new Set(p);
      for (const x of id) {
        if (aktif) n.add(x);
        else n.delete(x);
      }
      return n;
    });

  /** Ganti regu: yang belum diselesaikan regu (sama dengan modal rincian). */
  const bisaPindahRegu = (b: BarisRabas) => ["Dijadwalkan", "Dalam Proses", "Ditolak"].includes(b.statusDb) && bolehUlp(b.ulp);
  /** Menu ⋯: penugasan langsung; keputusan (verifikasi/batal) lewat modal
   *  rincian — teknisaplikasi.md butir 7, admin harus melihat buktinya. */
  const aksiBaris = (b: BarisRabas) => [
    ...(bisaPindahRegu(b) ? [{ label: b.regu ? "Ganti regu…" : "Tugaskan regu…", onPilih: () => setIdRegu(b.id) }] : []),
    ...(b.status === "Menunggu verifikasi" ? [{ label: "Periksa & putuskan…", onPilih: () => setIdDetail(b.id) }] : []),
    { label: "Buka rincian", onPilih: () => setIdDetail(b.id) },
  ];

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

  const TAB: ItemTab<TabKey>[] = [
    { kunci: "daftar", label: "Daftar Segmen", ikon: ListChecks, angka: d.loading ? 0 : d.hitung["Belum ditugaskan"], angkaMasalah: true },
    { kunci: "dashboard", label: "Dashboard", ikon: LayoutDashboard },
    // Daftar WO yang sudah terbit — lihat & ubah (permintaan user 25 Sep 2026).
    { kunci: "wo", label: "Daftar WO", ikon: FileText },
    { kunci: "terbit", label: "Susun WO", ikon: Send },
  ];
  const CHIP: ItemChip<Chip>[] = [
    { kunci: "SEMUA", label: "Semua" },
    ...STATUS_RABAS.map((s) => ({ kunci: s, label: s, angka: d.loading ? null : d.hitung[s], nada: nadaStatus(s) })),
    {
      kunci: "LUAR",
      label: "Di luar WO",
      ikon: <TreeDeciduous size={13} />,
      angka: l.loading ? null : l.semua.length,
      peringatan: !l.loading && l.menunggu > 0 ? `${l.menunggu} menunggu` : null,
      judul: "Pohon dirabas tanpa segmen WO — tidak dihitung km",
    },
  ];

  // Pohon dilihat bersama jaringannya di Peta Jaringan (lapisan Pohon,
  // keputusan user 8 Okt 2026) — bukan peta tersendiri di sini.
  const lihatPeta = (
    <Link
      href={`/peta?pohon=1${d.ulp && d.ulp !== "SEMUA" ? `&ulp=${d.ulp}` : ""}`}
      className="grid place-items-center w-10 h-10 rounded-xl border border-line bg-white shadow-sm text-ink-soft hover:border-brand-300 hover:text-brand-700"
      title="Lihat pohon di peta — temuan pohon dari inspeksi JTM dan pohon yang sudah dirabas"
      aria-label="Lihat pohon di peta"
    >
      <Map size={17} strokeWidth={1.75} />
    </Link>
  );

  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiKepala>
        <TabPil
          tab={TAB}
          aktif={tab}
          onPilih={(k) => {
            setTab(k);
            setWoAwal(null);
          }}
        />
      </IsiKepala>

      {tab !== "terbit" && (
        <IsiTopbar>
          <PilihUlp nilai={d.ulp} onUbah={d.setUlp} daftar={d.daftarUlp} />
          {tab === "daftar" && (
            <>
              <PilihPeriode tahun={d.tahun} bulan={d.bulan} daftarTahun={d.daftarTahun} onTahun={d.setTahun} onBulan={d.setBulan} />
              <KotakCari nilai={d.cari} onUbah={d.setCari} placeholder="Cari penyulang, segmen, regu" lebar="w-[215px]" />
            </>
          )}
          {tab === "dashboard" && (
            <PilihTahun tahun={d.tahun} daftarTahun={d.daftarTahun} onTahun={d.setTahun} />
          )}
          {lihatPeta}
        </IsiTopbar>
      )}

      {tab === "terbit" ? (
        <SusunWoSegmen
          key={woAwal?.id ?? "baru"}
          user={user}
          istilah={ISTILAH}
          garansi="perabasan"
          infoSla={infoSla}
          woAwal={woAwal}
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
      ) : tab === "dashboard" ? (
        <DashboardPerabasan key={`${d.ulp}-${d.tahun}`} ulp={d.ulp} tahun={d.tahun} />
      ) : tab === "wo" ? (
        <DaftarWo wo={w.wo} ulp={d.ulp} loading={w.loading} onDetail={(x) => setIdWo(x.wo_id)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <ChipSaring
              item={CHIP}
              aktif={lihatLuar ? "LUAR" : d.status}
              onPilih={(k) => {
                if (k === "LUAR") setLihatLuar(true);
                else {
                  setLihatLuar(false);
                  d.setStatus(k);
                }
              }}
            />
            <Tombol
              ragam="utama"
              className="ml-auto"
              ikon={mengunduh ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              onClick={() => void unduh()}
              disabled={lihatLuar || d.loading || !!d.galat || d.baris.length === 0 || mengunduh}
              title="Mengunduh baris yang sedang tampil di tabel"
            >
              Download XLSX
            </Tombol>
          </div>
          <CatatanInfo>
            Segmen yang masih berjalan selalu tampil, berapa pun umur WO-nya — itu tunggakan. Periode menyaring yang sudah
            diverifikasi (menurut tanggal selesai) dan yang dibatalkan.
          </CatatanInfo>

          {d.galat && !d.loading ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-semibold text-amber-800">Daftar gagal dimuat</p>
                <p className="mt-0.5 text-amber-700">{d.galat} — kosongnya tabel bukan berarti tidak ada pekerjaan.</p>
                <button onClick={d.muat} className="mt-2 font-semibold text-brand-600 hover:text-brand-700">Muat ulang</button>
              </div>
            </div>
          ) : lihatLuar ? (
            l.galat && !l.loading ? (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-800">Rabas di luar WO gagal dimuat</p>
                  <p className="mt-0.5 text-amber-700">{l.galat} — kosongnya tabel bukan berarti tidak ada pekerjaan.</p>
                  <button onClick={l.muat} className="mt-2 font-semibold text-brand-600 hover:text-brand-700">Muat ulang</button>
                </div>
              </div>
            ) : (
              <TabelLuarWo baris={l.baris} loading={l.loading} onDetail={(b) => setIdLuar(b.id)} />
            )
          ) : !d.loading && d.baris.length === 0 ? (
            <TabelKosong judul="Tidak ada segmen perabasan">
              Segmen masuk ke sini begitu WO diterbitkan di tab Susun WO. Yang masih berjalan selalu tampil; yang sudah
              diverifikasi atau dibatalkan mengikuti periode yang dipilih.
            </TabelKosong>
          ) : (
            <>
              {dipilih.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm">
                  <span>
                    <b className="tabular-nums">{dipilih.length}</b> segmen dipilih ·{" "}
                    {kmTeks(dipilih.reduce((a, b) => a + (b.panjangKm ?? 0), 0))} km
                  </span>
                  <button onClick={() => setPilih(new Set())} className="text-xs text-ink-soft hover:text-ink">Batal pilih</button>
                  <Tombol ukuran="sm" className="ml-auto text-red-700" ikon={<Ban size={14} />} onClick={() => setKeluarkan(true)}>
                    Keluarkan dari WO ({dipilih.length})
                  </Tombol>
                </div>
              )}
              <TabelRabas
                key={`${d.ulp}-${d.tahun}-${d.bulan}-${d.status}`}
                baris={d.baris}
                loading={d.loading}
                onDetail={(b) => setIdDetail(b.id)}
                dipilih={pilih}
                onPilih={ubahPilih}
                bisaPilih={bisaPilih}
                aksi={aksiBaris}
              />
            </>
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
        />
      )}

      {barisRegu && (
        <TugaskanReguModal
          b={barisRegu}
          regu={w.regu}
          onSimpan={(regu) => w.tugaskanRegu(barisRegu.id, regu, oleh).then(lalu(barisRegu.id))}
          onTutup={() => setIdRegu(null)}
        />
      )}

      {keluarkan && (
        <BatalkanModal
          judul={`Keluarkan ${dipilih.length} segmen dari WO?`}
          keterangan="Segmen keluar dari WO dan dari HP regu, tetap tercatat berstatus Dibatalkan beserta alasannya. Segmen yang ternyata sudah dikerjakan regu dilewati."
          labelTombol="Keluarkan"
          onTutup={() => setKeluarkan(false)}
          onBatalkan={async (alasan) => {
            const ok = await w.keluarkanBanyak(dipilih.map((b) => b.id), alasan, oleh);
            if (ok) {
              setPilih(new Set());
              d.muat();
            }
            return ok;
          }}
        />
      )}

      {detailLuar && (
        <DetailLuarWoModal
          b={detailLuar}
          bolehPutuskan={bolehUlp(detailLuar.ulp)}
          onTutup={() => setIdLuar(null)}
          onPutuskan={(id, terima, catatan) => l.putuskan(id, terima, catatan, oleh)}
          onBatalkan={(id, alasan) => l.batalkan(id, alasan, oleh)}
        />
      )}
      {detailWo && (
        <DetailWoModal
          w={detailWo}
          bolehUbah={bolehUlp(detailWo.ulp)}
          ambilItem={w.ambilItemWo}
          onUbah={(v) => w.ubahWo({ ...v, oleh })}
          onBatalkanWo={async (alasan) => {
            const ok = await w.batalkanWo(detailWo.wo_id, alasan, oleh);
            if (ok) {
              setIdWo(null);
              d.muat();
            }
            return ok;
          }}
          onTambahSegmen={() => {
            setWoAwal({ id: detailWo.wo_id, ulp: detailWo.ulp });
            setIdWo(null);
            setTab("terbit");
          }}
          onTutup={() => setIdWo(null)}
        />
      )}
    </div>
  );
}
