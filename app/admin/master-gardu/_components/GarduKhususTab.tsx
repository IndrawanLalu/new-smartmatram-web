"use client";

import { useMemo, useState } from "react";
import { Building2, Search, Undo2, Plus } from "lucide-react";
import type { CurrentUser } from "@/lib/roles";
import { kunciGk, labelAlasanGk } from "@/lib/garduKhusus";
import { BTN_GHOST, BTN_PRIMARY, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { BarisMemuat, DuaBaris, KakiTabel, KartuTabel, Kolom, TD, TabelKosong } from "@/app/admin/_kit/Tabel";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { useGarduKhusus, type GarduKhusus } from "../_hooks/useGarduKhusus";
import TabelUsulanGk from "./TabelUsulanGk";
import TetapkanGkModal from "./TetapkanGkModal";

const PER_HAL = 20;
const tgl = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const kunci = (g: { kode: string; ulp: string }) => `${g.ulp}|${g.kode}`;

/**
 * Gardu khusus (scripts/gardu-khusus.sql): gardu yang tidak dikerjakan PLN —
 * dikeluarkan dari Inspeksi Gardu, Inspeksi JTR, dan Pemeliharaan Gardu.
 * Usulan dari HP menunggu persetujuan di sini; admin juga bisa menetapkan
 * langsung. Yang berhak: UP3 dan admin ULP itu (dijaga juga di database).
 */
export default function GarduKhususTab({ user, ulp }: { user: CurrentUser; ulp: string }) {
  const g = useGarduKhusus(ulp, user.name || user.email);
  const boleh = user.role === "UP3" || user.role === "admin";

  const [cari, setCari] = useState("");
  const [hal, setHal] = useState(1);
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [tetapkanBuka, setTetapkanBuka] = useState(false);
  const [kembalikanBuka, setKembalikanBuka] = useState(false);

  const tampil = useMemo(() => {
    const q = cari.trim().toUpperCase();
    return (g.khusus ?? []).filter((x) =>
      !q || [x.kode, x.nama ?? "", x.alamat ?? "", x.penyulang ?? ""].some((v) => v.toUpperCase().includes(q)));
  }, [g.khusus, cari]);
  const totalHal = Math.max(1, Math.ceil(tampil.length / PER_HAL));
  const halIni = tampil.slice((hal - 1) * PER_HAL, hal * PER_HAL);
  const terpilih = (g.khusus ?? []).filter((x) => pilih.has(kunci(x)));

  const ubahPilih = (x: GarduKhusus) =>
    setPilih((p) => {
      const s = new Set(p);
      if (s.has(kunci(x))) s.delete(kunci(x));
      else s.add(kunci(x));
      return s;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} p-4 flex flex-wrap items-center gap-3`}>
        <Building2 size={18} className="text-navy-600 shrink-0" />
        <p className="text-sm text-ink-soft flex-1 min-w-64">
          Gardu khusus tidak masuk WO <b>Inspeksi Gardu</b>, <b>Inspeksi JTR</b>, dan <b>Pemeliharaan Gardu</b>.
          Menetapkannya membatalkan item WO yang masih terbuka untuk gardu itu. Pengukuran tidak berubah.
        </p>
        {boleh && (
          <button onClick={() => setTetapkanBuka(true)} className={BTN_PRIMARY}>
            <Plus size={15} /> Tetapkan gardu khusus
          </button>
        )}
      </div>

      {g.galat && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{g.galat}</div>}

      <TabelUsulanGk usulan={g.usulan} boleh={boleh} onPutuskan={g.putuskan} />

      <div className="flex flex-wrap items-center gap-3">
        <p className={EYEBROW}>Gardu khusus · {g.khusus?.length ?? "…"}</p>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={cari}
            onChange={(e) => { setCari(e.target.value); setHal(1); }}
            placeholder="Cari kode, nama, penyulang…"
            className={`${FIELD} pl-8 w-64`}
          />
        </div>
        {boleh && (
          <button onClick={() => setKembalikanBuka(true)} disabled={terpilih.length === 0} className={BTN_GHOST}>
            <Undo2 size={15} /> Kembalikan jadi gardu biasa{terpilih.length ? ` (${terpilih.length})` : ""}
          </button>
        )}
      </div>

      {g.khusus && tampil.length === 0 ? (
        <TabelKosong judul={cari ? "Tidak ada yang cocok" : "Belum ada gardu khusus"}>
          {cari ? "Longgarkan pencarian." : "Tetapkan dari tombol di atas, atau setujui usulan petugas dari HP."}
        </TabelKosong>
      ) : (
        <KartuTabel
          kaki={<KakiTabel hal={hal} total={totalHal} onHal={setHal} ringkas={`${tampil.length} gardu khusus`} />}
        >
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {boleh && <Kolom lebar="w-10" />}
                <Kolom>Gardu</Kolom>
                <Kolom>Penyulang</Kolom>
                <Kolom>Alasan</Kolom>
                <Kolom>Keterangan</Kolom>
                <Kolom>Ditetapkan</Kolom>
              </tr>
            </thead>
            <tbody>
              {!g.khusus ? (
                <BarisMemuat kolom={boleh ? 6 : 5} baris={5} />
              ) : (
                halIni.map((x) => (
                  <tr key={kunci(x)} className="hover:bg-navy-50/50">
                    {boleh && (
                      <td className={TD}>
                        <input type="checkbox" checked={pilih.has(kunci(x))} onChange={() => ubahPilih(x)} className="accent-navy-600" />
                      </td>
                    )}
                    <td className={TD}><DuaBaris utama={<b>{x.kode}</b>} bawah={x.nama ?? x.ulp} /></td>
                    <td className={TD}><DuaBaris utama={x.penyulang ?? "—"} bawah={x.ulp} /></td>
                    <td className={`${TD} max-w-56`}>{x.alasan.map(labelAlasanGk).join(" · ")}</td>
                    <td className={`${TD} max-w-64 text-ink-soft`}>{x.keterangan ?? "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <DuaBaris utama={tgl(x.ditetapkan_at)} bawah={`${x.sumber === "hp" ? "usulan HP" : "web"} · ${x.ditetapkan_oleh ?? "—"}`} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </KartuTabel>
      )}

      {tetapkanBuka && (
        <TetapkanGkModal
          muatPilihan={g.muatPilihan}
          sudah={new Set((g.khusus ?? []).map((x) => kunciGk(x.kode, x.ulp)))}
          onTutup={() => setTetapkanBuka(false)}
          onTetapkan={g.tetapkan}
        />
      )}

      {kembalikanBuka && (
        <BatalkanModal
          judul={`Kembalikan ${terpilih.length} gardu jadi gardu biasa?`}
          keterangan={`${terpilih.slice(0, 6).map((x) => x.kode).join(", ")}${terpilih.length > 6 ? ", …" : ""} akan bisa masuk WO Inspeksi Gardu, Inspeksi JTR, dan Pemeliharaan Gardu lagi.`}
          peringatan="Item WO yang dulu dibatalkan karena gardu khusus TIDAK dipulihkan — masukkan lagi di WO berikutnya."
          labelTombol="Kembalikan jadi gardu biasa"
          placeholder="Alasan — mis. ternyata gardu PLN, salah tetapkan"
          onTutup={() => setKembalikanBuka(false)}
          onBatalkan={async (alasan) => {
            const ok = await g.kembalikan(terpilih.map((x) => ({ kode: x.kode, ulp: x.ulp })), alasan);
            if (ok) setPilih(new Set());
            return ok;
          }}
        />
      )}
    </div>
  );
}
