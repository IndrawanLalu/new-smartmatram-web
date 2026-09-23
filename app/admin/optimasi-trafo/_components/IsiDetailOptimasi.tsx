"use client";

import { Link2, Loader2, MapPin, TriangleAlert } from "lucide-react";
import { BTN_GHOST, EYEBROW } from "@/app/admin/_ui";
import type { BatalWo, CatatanOptimasi, Jejak, UsulanMaster, WoTerbuka } from "../_hooks/useOptimasiTrafo";
import { nadaPersen, persen, tanggal, teksAsal, teksTujuan } from "../_lib/tampilan";

/**
 * Isi modal detail: SEBELUM berdampingan dengan SESUDAH.
 *
 * Berdampingan, bukan berurutan — yang dinilai admin adalah bedanya: papan
 * nama lama vs baru, kVA lama vs baru, beban sebelum vs sesudah.
 */

const LABEL_FIELD: Record<string, string> = {
  daya: "kVA",
  no_seri: "No. seri",
  merk: "Merk",
  tahun_pembuatan: "Tahun pembuatan",
};

const KATA_JEJAK: Record<Exclude<Jejak, null>, { teks: string; nada: string }> = {
  bersambung: { teks: "tersambung lewat nomor seri", nada: "text-emerald-700" },
  dipastikan: { teks: "dipastikan admin", nada: "text-navy-600" },
  terbuka: { teks: "belum ada catatan di gardu itu", nada: "text-amber-700" },
};

const seriBeda = (a: string | null, b: string | null) =>
  !!a && !!b && a.toUpperCase().replace(/[^A-Z0-9]/g, "") !== b.toUpperCase().replace(/[^A-Z0-9]/g, "");

function Nilai({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-ink-muted">{label}</p>
      <div className="text-sm font-semibold text-ink">{children}</div>
    </div>
  );
}

function Foto({ url, label }: { url: string; label: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={`Buka ${label} ukuran penuh`} className="block group">
      {/* next/image sengaja tidak dipakai — sama dengan modul pemeliharaan lain. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="w-full h-48 object-cover rounded-xl border border-line group-hover:border-navy-300" />
      <span className="block text-[10px] text-ink-muted mt-1">{label} — klik untuk ukuran penuh</span>
    </a>
  );
}

function Panel({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-4 flex flex-col gap-3">
      <p className={EYEBROW}>{judul}</p>
      {children}
    </div>
  );
}

/** WO yang belum dikerjakan (atau dibatalkan) — yang ada baru kondisi SEBELUM. */
export function IsiWo({ w, batal }: { w: WoTerbuka; batal: BatalWo | null }) {
  return (
    <>
      {batal && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-sm font-semibold text-ink">WO dibatalkan</p>
          <p className="text-sm text-ink-soft mt-1">{batal.alasan}</p>
          <p className="text-[11px] text-ink-muted mt-1">
            {batal.oleh ?? "—"} · {tanggal(batal.pada)}
          </p>
        </div>
      )}
      <Panel judul="Kondisi saat WO terbit">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Nilai label="Beban"><span className={nadaPersen(w.persenBeban)}>{persen(w.persenBeban)}</span></Nilai>
          <Nilai label="Beban kVA">{w.bebanKva ?? "—"}</Nilai>
          <Nilai label="Suhu trafo">{w.suhu !== null ? `${w.suhu} °C` : "—"}</Nilai>
          <Nilai label="Tanggal ukur">{tanggal(w.tglUkur)}</Nilai>
          <Nilai label="kVA di master">{w.kvaMaster ?? w.kvaTrafo ?? "—"}</Nilai>
          <Nilai label="No. seri di master"><span className="font-mono">{w.noSeriMaster ?? "—"}</span></Nilai>
          <Nilai label="Merk di master">{w.merkMaster ?? "—"}</Nilai>
          <Nilai label="WO terbit">{tanggal(w.woSentAt)}</Nilai>
        </div>
        {w.alamat && <p className="text-xs text-ink-soft">{w.alamat}</p>}
      </Panel>
      {!batal && (
        <p className="text-xs text-ink-muted">
          Belum ada catatan dari HP. Begitu regu mengirim optimasinya, WO ini berubah menjadi
          &quot;Menunggu verifikasi&quot; dan kondisi sesudahnya tampil di sini. Kalau WO ini keliru,
          atau bebannya sudah beres dengan cara lain (pecah beban, manuver), batalkan WO-nya.
        </p>
      )}
    </>
  );
}

interface IsiCatatanProps {
  c: CatatanOptimasi;
  usulan: UsulanMaster[] | null;
  galatUsulan: string | null;
  sibuk: boolean;
  onPastikan: () => void;
}

export function IsiCatatan({ c, usulan, galatUsulan, sibuk, onPastikan }: IsiCatatanProps) {
  const kvaMasterBeda = c.kvaLamaMaster !== null && c.kvaLamaMaster !== c.kvaLama;
  const seriMasterBeda = seriBeda(c.noSeriLama, c.noSeriLamaMaster);
  const jejakTerbuka = c.statusDb !== "Dibatalkan" && (c.jejakAsal === "terbuka" || c.jejakTujuan === "terbuka");

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel judul="Sebelum — trafo lama">
          <div className="grid grid-cols-2 gap-3">
            <Nilai label="kVA">{c.kvaLama}</Nilai>
            <Nilai label="No. seri">
              <span className="font-mono">{c.seriLamaTakTerbaca ? "tak terbaca" : c.noSeriLama}</span>
            </Nilai>
            <Nilai label="Beban">
              <span className={nadaPersen(c.sebelumPersen)}>{persen(c.sebelumPersen)}</span>
              {c.sebelumKvaBeban !== null && <span className="text-xs font-normal text-ink-muted"> · {c.sebelumKvaBeban} kVA</span>}
            </Nilai>
            <Nilai label="Diukur">{tanggal(c.sebelumTgl)}</Nilai>
          </div>
          {(kvaMasterBeda || seriMasterBeda) && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
              <TriangleAlert size={12} className="mt-0.5 shrink-0" />
              Papan nama tidak cocok dengan master
              {kvaMasterBeda && ` (master ${c.kvaLamaMaster} kVA)`}
              {seriMasterBeda && ` (master seri ${c.noSeriLamaMaster})`} — masternya sudah salah sebelum pekerjaan ini.
            </p>
          )}
          <Foto url={c.fotoLama} label="Papan nama trafo lama" />
        </Panel>

        <Panel judul="Sesudah — trafo baru">
          <div className="grid grid-cols-2 gap-3">
            <Nilai label="kVA">{c.kvaBaru}</Nilai>
            <Nilai label="No. seri"><span className="font-mono">{c.noSeriBaru}</span></Nilai>
            <Nilai label="Beban (terhadap kVA baru)">
              <span className={nadaPersen(c.sesudahPersen)}>{persen(c.sesudahPersen)}</span>
              {c.sesudahKvaBeban !== null && <span className="text-xs font-normal text-ink-muted"> · {c.sesudahKvaBeban} kVA</span>}
            </Nilai>
            <Nilai label="Pengukuran terakhir">{tanggal(c.sesudahTgl)}</Nilai>
            <Nilai label="Merk / tahun">{[c.merkBaru, c.tahunBaru].filter(Boolean).join(" ") || "—"}</Nilai>
          </div>
          {c.sesudahTgl && !c.sesudahDiukurUlang && (
            <p className="text-[11px] text-ink-muted">
              Pengukuran terakhir diambil sebelum pekerjaan — angkanya beban lama dibagi kapasitas baru,
              belum hasil ukur ulang.
            </p>
          )}
          <Foto url={c.fotoBaru} label="Papan nama trafo baru" />
        </Panel>
      </div>

      <Panel judul="Perpindahan trafo">
        {[
          { label: "Trafo baru dari", isi: teksAsal(c), jejak: c.jejakAsal },
          { label: "Trafo lama ke", isi: teksTujuan(c), jejak: c.jejakTujuan },
        ].map((r) => (
          <p key={r.label} className="text-sm text-ink">
            <span className="text-ink-muted">{r.label}:</span> {r.isi}
            {r.jejak && <span className={`ml-2 text-xs font-semibold ${KATA_JEJAK[r.jejak].nada}`}>· {KATA_JEJAK[r.jejak].teks}</span>}
          </p>
        ))}
        {jejakTerbuka && (
          <button onClick={onPastikan} disabled={sibuk} className={`${BTN_GHOST} h-8 px-3 text-xs self-start`}>
            <Link2 size={12} /> Gardu seberang sudah dipastikan
          </button>
        )}
      </Panel>

      <Panel judul="Perubahan master gardu">
        {galatUsulan ? (
          <p className="text-xs text-amber-700">Daftar perubahan gagal dimuat: {galatUsulan}</p>
        ) : usulan === null ? (
          <p className="text-xs text-ink-muted flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Memuat…</p>
        ) : usulan.length === 0 ? (
          <p className="text-xs text-ink-muted">Tidak ada — master sudah sesuai dengan trafo baru.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {usulan.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="py-1.5 text-xs text-ink-muted w-36">{LABEL_FIELD[u.field] ?? u.field}</td>
                  <td className="py-1.5 font-mono text-xs text-ink">
                    {u.nilaiLama ?? "kosong"} → <b>{u.nilaiBaru}</b>
                  </td>
                  <td className="py-1.5 text-[11px] text-right text-ink-soft">
                    {u.status === "menunggu" ? "menunggu verifikasi" : `${u.status}${u.penilaiNama ? ` · ${u.penilaiNama}` : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Nilai label="Alasan">{c.alasanLabel ?? c.alasan}</Nilai>
        <Nilai label="Tanggal pekerjaan">{tanggal(c.tglOperasi)}</Nilai>
        <Nilai label="Petugas">{c.petugasNama ?? "—"}</Nilai>
        <Nilai label="Sumber">{c.pengukuranId ? "WO" : "di luar WO"}</Nilai>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {c.lat !== null && c.lng !== null ? (
          <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-navy-600 hover:text-navy-500">
            <MapPin size={12} /> {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-ink-muted"><MapPin size={12} /> titik tidak terbaca</span>
        )}
        {c.verifiedBy && (
          <span className="text-ink-muted">
            {c.statusDb === "Dibatalkan" ? "dibatalkan" : "diverifikasi"} oleh {c.verifiedBy}
            {c.verifiedAt ? ` · ${tanggal(c.verifiedAt)}` : ""}
          </span>
        )}
      </div>
      {c.catatan && <p className="text-xs text-ink-soft italic">{c.catatan}</p>}
    </>
  );
}
