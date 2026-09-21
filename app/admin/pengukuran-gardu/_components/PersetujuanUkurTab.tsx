"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Gauge,
  Loader2,
  MapPin,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import type { CurrentUser } from "@/lib/roles";
import { usePersetujuanUkur, type UsulanUkur } from "../_hooks/usePersetujuanUkur";
import PetaSebelumSesudah from "./PetaSebelumSesudah";
import { detectAnomali, type AnomalySettings } from "@/lib/anomaliGardu";
import type { PengukuranGardu } from "../_hooks/usePengukuranGardu";

/**
 * Persetujuan pengukuran — tiga kelompok yang tidak sama beratnya.
 *
 *   TITIK diperbarui   menahan realisasi · master SUDAH berubah
 *   BEDA kVA           menahan realisasi · master BELUM berubah
 *   ANOMALI hasil ukur TIDAK menahan · tidak ada master yang perlu diubah
 *
 * Yang ketiga sengaja ditaruh di tab yang sama meski tidak menahan apa-apa:
 * dia tetap perlu dilihat orang, dan memberinya tab sendiri berarti tab yang
 * tidak pernah dibuka.
 */

type Kel = "titik" | "kva" | "anomali";

export default function PersetujuanUkurTab({
  user,
  pengukuran,
  settings,
}: {
  user: CurrentUser;
  /** Pengukuran periode berjalan — sumber kelompok anomali. */
  pengukuran: PengukuranGardu[];
  settings: AnomalySettings;
}) {
  const { titik, kva, loading, putuskan } = usePersetujuanUkur(user);
  const [kel, setKel] = useState<Kel>("titik");

  // Anomali dihitung DI SINI dengan fungsi yang sama dipakai seluruh halaman.
  // Tidak disimpan dan tidak melahirkan usulan — ambangnya bisa disetel kapan
  // saja, dan daftar yang disimpan akan langsung basi begitu ambangnya digeser.
  const anomali = useMemo(
    () => pengukuran.filter((d) => detectAnomali(d, settings).isAnomali),
    [pengukuran, settings],
  );

  const oleh = user.name ?? user.email;
  const TAB: { key: Kel; label: string; n: number; sorot: boolean }[] = [
    { key: "titik", label: "Titik diperbarui", n: titik.length, sorot: true },
    { key: "kva", label: "Beda kVA", n: kva.length, sorot: true },
    { key: "anomali", label: "Anomali hasil ukur", n: anomali.length, sorot: false },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat yang menunggu keputusan…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-center gap-2">
          {TAB.map((t) => (
            <button
              key={t.key}
              onClick={() => setKel(t.key)}
              className={`${CHIP} ${kel === t.key ? CHIP_ON : CHIP_OFF}`}
            >
              {t.label}
              <span
                className={`tabular-nums ${
                  kel === t.key
                    ? "text-white/70"
                    : t.n > 0 && t.sorot
                      ? "text-red-700 font-bold"
                      : "text-ink-muted"
                }`}
              >
                {t.n}
              </span>
            </button>
          ))}
        </div>

        <p className="text-xs text-ink-soft mt-3 max-w-3xl">
          {kel === "titik" && (
            <>
              Titik masternya <b>sudah diperbarui</b> memakai titik petugas — menolak akan
              mengembalikannya. Selama belum diputuskan, pengukurannya{" "}
              <b>belum terhitung realisasi</b>.
            </>
          )}
          {kel === "kva" && (
            <>
              kVA master <b>belum berubah</b> dan menunggu keputusan Anda. Salah kVA menggerakkan
              orang dan barang — ia dipakai menghitung persen beban, memicu WO penggantian trafo,
              dan dikirim ke AMG. Selama belum diputuskan, pengukurannya{" "}
              <b>belum terhitung realisasi</b>.
            </>
          )}
          {kel === "anomali" && (
            <>
              Hasil ukur yang melewati ambang ULP ini. <b>Tetap terhitung realisasi</b> — ini
              pengukuran yang benar dan sudah dikerjakan; yang perlu ditindaklanjuti keadaan
              gardunya, bukan laporannya. Ambangnya disetel di tab Pengaturan.
            </>
          )}
        </p>
      </div>

      {kel === "titik" &&
        (titik.length === 0 ? (
          <Kosong teks="Tidak ada titik yang menunggu diperiksa." />
        ) : (
          titik.map((u) => (
            <KartuTitik
              key={u.usulan_id}
              u={u}
              onPutuskan={(setuju, alasan) => putuskan(u.usulan_id, setuju, alasan, oleh)}
            />
          ))
        ))}

      {kel === "kva" &&
        (kva.length === 0 ? (
          <Kosong teks="Tidak ada selisih kVA yang menunggu diperiksa." />
        ) : (
          kva.map((u) => (
            <KartuKva
              key={u.usulan_id}
              u={u}
              onPutuskan={(setuju, alasan) => putuskan(u.usulan_id, setuju, alasan, oleh)}
            />
          ))
        ))}

      {kel === "anomali" &&
        (anomali.length === 0 ? (
          <Kosong teks="Tidak ada hasil ukur yang melewati ambang." />
        ) : (
          <div className={`${CARD} p-5`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-ink-soft border-b border-line bg-surface">
                    {["Gardu", "Penyulang", "Tanggal", "% Beban", "Suhu", "Sebab"].map((h) => (
                      <th key={h} className="px-3 py-2.5 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {anomali.map((d) => (
                    <tr key={d.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 font-semibold text-ink">{d.no_gardu}</td>
                      <td className="px-3 py-2 text-ink-soft">{d.penyulang ?? "—"}</td>
                      <td className="px-3 py-2 text-ink-soft">{d.tanggal_pengukuran}</td>
                      <td className="px-3 py-2 tabular-nums font-mono">
                        {Math.round(d.persen_beban)}%
                      </td>
                      <td className="px-3 py-2 tabular-nums font-mono text-ink-soft">
                        {d.suhu_trafo ? `${d.suhu_trafo}°` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-amber-800">
                        {detectAnomali(d, settings).reasons.join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}

function Kosong({ teks }: { teks: string }) {
  return (
    <div className={`${CARD} p-10 text-center`}>
      <BadgeCheck size={26} className="mx-auto text-ink-muted opacity-40" />
      <p className="text-sm text-ink-soft mt-2">{teks}</p>
    </div>
  );
}

/** Kepala kartu — sama untuk titik maupun kVA. */
function Kepala({ u, ikon }: { u: UsulanUkur; ikon: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <span className="mt-0.5">{ikon}</span>
      <div className="flex-1 min-w-[200px]">
        <p className="font-semibold text-ink">
          {u.kode_gardu}
          {u.nama_gardu ? <span className="font-normal text-ink-soft"> · {u.nama_gardu}</span> : null}
        </p>
        <p className="text-xs text-ink-muted mt-0.5">
          {u.ulp}
          {u.penyulang && ` · ${u.penyulang}`}
          {u.alamat && ` · ${u.alamat}`}
        </p>
        <p className="text-[11px] text-ink-muted mt-0.5">
          {u.petugas_nama ?? u.pengusul_nama ?? "petugas tidak tercatat"}
          {u.tanggal_pengukuran && ` · diukur ${u.tanggal_pengukuran}`}
          {u.jam_pengukuran && ` ${u.jam_pengukuran}`}
        </p>
      </div>
    </div>
  );
}

/** Tombol putusan — alasan wajib saat menolak. */
function Putusan({
  labelTolak,
  onPutuskan,
}: {
  labelTolak: string;
  onPutuskan: (setuju: boolean, alasan: string) => Promise<boolean>;
}) {
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState<"ya" | "tidak" | null>(null);

  const tekan = async (setuju: boolean) => {
    setSibuk(setuju ? "ya" : "tidak");
    await onPutuskan(setuju, alasan.trim());
    setSibuk(null);
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <input
        value={alasan}
        onChange={(e) => setAlasan(e.target.value)}
        placeholder="Catatan — wajib kalau ditolak"
        className={`${FIELD} flex-1 min-w-[220px]`}
      />
      <button
        onClick={() => void tekan(false)}
        disabled={sibuk !== null || !alasan.trim()}
        title={alasan.trim() ? labelTolak : "Tulis alasannya dulu"}
        className={`${BTN_GHOST} border-red-200 text-red-700 hover:bg-red-50`}
      >
        {sibuk === "tidak" ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}
        {labelTolak}
      </button>
      <button onClick={() => void tekan(true)} disabled={sibuk !== null} className={BTN_PRIMARY}>
        {sibuk === "ya" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <BadgeCheck size={15} />
        )}
        Setujui
      </button>
    </div>
  );
}

function KartuTitik({
  u,
  onPutuskan,
}: {
  u: UsulanUkur;
  onPutuskan: (setuju: boolean, alasan: string) => Promise<boolean>;
}) {
  return (
    <div className={`${CARD} p-5`}>
      <Kepala u={u} ikon={<MapPin size={18} className="text-navy-600" />} />

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <PetaSebelumSesudah
          titik={{
            lamaLat: u.nilai_lama?.lat ?? null,
            lamaLng: u.nilai_lama?.lng ?? null,
            baruLat: u.nilai_baru.lat as number,
            baruLng: u.nilai_baru.lng as number,
            akurasiM: u.bukti_akurasi,
            selisihM: u.bukti_selisih,
          }}
        />

        <div>
          {u.catatan && (
            <p className="text-xs text-ink-soft">
              Keterangan petugas: <i>“{u.catatan}”</i>
            </p>
          )}

          {/* Foto papan nama gardu — satu-satunya yang membedakan koreksi dari
              petugas yang salah gardu. Ditampilkan, bukan di balik tombol. */}
          {u.bukti_foto.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {u.bukti_foto.map((f) => (
                <a key={f} href={f} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f}
                    alt="Bukti"
                    className="w-28 h-28 object-cover rounded-lg border border-line bg-surface"
                  />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-700 mt-2">
              Tidak ada foto bukti. Tanpa papan nama gardunya, perpindahan ini tidak bisa
              dibedakan dari petugas yang salah gardu.
            </p>
          )}

          <p className="text-[11px] text-ink-muted mt-3">
            Titik master <b>sudah</b> memakai nilai baru. Menolak akan mengembalikannya ke nilai
            sebelumnya.
          </p>
        </div>
      </div>

      <Putusan labelTolak="Tolak & kembalikan titik" onPutuskan={onPutuskan} />
    </div>
  );
}

function KartuKva({
  u,
  onPutuskan,
}: {
  u: UsulanUkur;
  onPutuskan: (setuju: boolean, alasan: string) => Promise<boolean>;
}) {
  const lama = u.nilai_lama?.nilai ?? null;
  const baru = u.nilai_baru.nilai ?? null;

  return (
    <div className={`${CARD} p-5`}>
      <Kepala u={u} ikon={<Gauge size={18} className="text-amber-600" />} />

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-ink-soft line-through tabular-nums">
            {lama !== null ? `${lama} kVA` : "belum ada"}
          </span>
          <span className="text-ink-muted">→</span>
          <span className="text-lg font-semibold text-ink tabular-nums">{baru} kVA</span>
        </div>

        {/* Persen beban dihitung dari kVA. Kalau kVA-nya berubah, angka yang
            selama ini dipakai memutuskan overload ikut berubah — dan itu harus
            terlihat sebelum disetujui, bukan sesudah. */}
        {u.beban_kva !== null && baru ? (
          <span className="text-xs text-ink-soft">
            Beban {Math.round(u.beban_kva)} kVA ={" "}
            <b className="text-ink">{((u.beban_kva / baru) * 100).toFixed(0)}%</b> dari kVA baru
            {lama ? (
              <span className="text-ink-muted">
                {" "}
                (sebelumnya {((u.beban_kva / lama) * 100).toFixed(0)}%)
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {u.catatan && (
        <p className="text-xs text-ink-soft mt-2">
          Keterangan petugas: <i>“{u.catatan}”</i>
        </p>
      )}

      <p className="text-[11px] text-ink-muted mt-3 flex items-start gap-1.5">
        <TriangleAlert size={12} className="text-amber-600 shrink-0 mt-0.5" />
        kVA master <b>belum berubah</b>. Menyetujui akan mengubahnya, dan seluruh persen beban
        gardu ini dihitung ulang memakai angka baru.
      </p>

      <Putusan labelTolak="Tolak" onPutuskan={onPutuskan} />
    </div>
  );
}
