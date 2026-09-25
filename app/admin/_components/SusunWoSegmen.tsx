"use client";

import { useMemo, useState } from "react";
import { FileWarning, Loader2, Send, TriangleAlert, Users } from "lucide-react";
import { BTN_PRIMARY, CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import { canSeeAllUnits, UNITS, type CurrentUser } from "@/lib/roles";
/** Segmen yang bisa dipilih — baris `master_segmen`. */
export interface SegmenPilihan {
  segmen_id: string;
  nama: string;
  penyulang: string;
  ulp: string;
  panjang_pakai_km: number | null;
  panjang_dari: "hitungan" | "ketikan" | "kosong";
  umur_inspeksi_bulan: number | null;
}

/** Regu/tim yang bisa ditugasi, beserta beban yang sedang dipikulnya. */
export interface ReguPilihan {
  regu: string;
  ulp: string;
  km_berjalan: number;
}

/** WO yang masih terbuka — tujuan "Tambah ke WO". */
export interface WoTerbuka {
  wo_id: string;
  ulp: string;
  nama: string;
  tgl_wo: string;
  target_km: number;
  item: number;
  rencana_km: number;
}

/** Kata-kata yang berbeda antar jenis WO (perabasan, inspeksi JTM, …). */
export interface IstilahWo {
  /** "Susun WO perabasan" */
  judul: string;
  /** "Perabasan Oktober 2026" */
  contohNama: string;
  /** true = segmen tanpa regu TIDAK muncul di HP siapa pun (perabasan).
   *  false = regu cuma penanda; semua tim se-ULP bisa mengerjakan (inspeksi). */
  reguWajib: boolean;
  /** Pesan saat ULP belum punya regu/tim aktif. */
  reguKosong: (ulp: string) => string;
}

/**
 * Menerbitkan WO bersatuan SEGMEN, diukur KILOMETER — dipakai WO Perabasan dan
 * WO Inspeksi JTM (`rencana-mobile-jtm-jtr.md` J4). Yang berbeda hanya
 * istilahnya dan apakah regu wajib (lihat `IstilahWo`).
 *
 * Yang harus terlihat SAAT MENCENTANG, bukan sesudah terbit:
 *
 *   1. Total km berjalan — karena targetnya km, bukan jumlah segmen.
 *   2. Berapa km di antaranya yang masih angka KETIKAN. Capaian dari segmen
 *      berpanjang ketikan tidak sebanding dengan yang diukur dari bentang
 *      tiang, dan WO yang seluruhnya ketikan menghasilkan laporan yang tidak
 *      bisa dibandingkan dengan bulan lalu.
 *   3. Segmen yang belum punya panjang SAMA SEKALI. Yang ini menyumbang 0 km
 *      ke rencana — tanpa penanda, WO terlihat kurang dari targetnya tanpa
 *      sebab yang jelas.
 *   4. Berapa yang belum dibagi ke REGU. Segmen tanpa regu tidak muncul di HP
 *      siapa pun, dan dari layar WO ia terlihat persis sama dengan yang sedang
 *      dikerjakan.
 */

export default function SusunWoSegmen({
  user,
  istilah,
  segmen,
  segmenTerikat,
  regu,
  woTerbuka,
  onTerbitkan,
  onTambah,
}: {
  user: CurrentUser;
  istilah: IstilahWo;
  segmen: SegmenPilihan[];
  segmenTerikat: Set<string>;
  regu: ReguPilihan[];
  /** WO yang masih berstatus Terbit — satu-satunya yang boleh ditambah. */
  woTerbuka: WoTerbuka[];
  onTerbitkan: (v: {
    ulp: string;
    nama: string;
    targetKm: number;
    segmen: string[];
    regu: Record<string, string>;
    tglWo: string;
  }) => Promise<{ item: number; dilewati: { segmen: string; sebab: string }[] } | null>;
  /** Tidak diisi = jenis WO ini belum bisa ditambah; pilihannya disembunyikan. */
  onTambah?: (v: {
    woId: string;
    segmen: string[];
    regu: Record<string, string>;
    targetKm: number | null;
  }) => Promise<{ item: number } | null>;
}) {
  const bolehSemua = canSeeAllUnits(user.role);
  const [ulp, setUlp] = useState(bolehSemua ? "" : (user.unit ?? ""));
  const [nama, setNama] = useState("");
  const [target, setTarget] = useState("");
  const [tgl, setTgl] = useState(() => new Date().toISOString().slice(0, 10));
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  /** segmen_id → nama regu. Kosong berarti belum dibagi. */
  const [bagi, setBagi] = useState<Record<string, string>>({});
  const [saringPenyulang, setSaringPenyulang] = useState("");
  const [sibuk, setSibuk] = useState(false);

  /**
   * "baru" = terbitkan WO sendiri · "tambah" = sisipkan ke WO yang sudah ada.
   *
   * Yang kedua ada karena memaksa membuat WO kedua memecah capaian satu bulan
   * jadi dua angka yang harus dijumlah orang — dan yang harus dijumlah orang
   * cepat atau lambat salah dijumlah.
   */
  const [mode, setMode] = useState<"baru" | "tambah">("baru");
  const [woTujuan, setWoTujuan] = useState("");

  const tersedia = useMemo(
    () =>
      segmen
        .filter((s) => (!ulp || s.ulp === ulp) && !segmenTerikat.has(s.segmen_id))
        .filter((s) => !saringPenyulang || s.penyulang === saringPenyulang)
        // Paling lama tidak diinspeksi di atas — sepola Master Segmen, supaya
        // yang paling perlu dirabas tidak harus dicari.
        .sort((a, b) => {
          const ua = a.umur_inspeksi_bulan ?? Number.MAX_SAFE_INTEGER;
          const ub = b.umur_inspeksi_bulan ?? Number.MAX_SAFE_INTEGER;
          return ub - ua || a.penyulang.localeCompare(b.penyulang);
        }),
    [segmen, ulp, segmenTerikat, saringPenyulang],
  );

  const reguUlp = useMemo(() => regu.filter((g) => g.ulp === ulp), [regu, ulp]);
  const woUlp = useMemo(() => woTerbuka.filter((w) => w.ulp === ulp), [woTerbuka, ulp]);
  const woDipilih = useMemo(
    () => woUlp.find((w) => w.wo_id === woTujuan) ?? null,
    [woUlp, woTujuan],
  );

  const daftarPenyulang = useMemo(
    () => [...new Set(segmen.filter((s) => !ulp || s.ulp === ulp).map((s) => s.penyulang))].sort(),
    [segmen, ulp],
  );

  const dipilih = useMemo(
    () => tersedia.filter((s) => pilih.has(s.segmen_id)),
    [tersedia, pilih],
  );
  const totalKm = dipilih.reduce((n, s) => n + (s.panjang_pakai_km ?? 0), 0);
  const kmKetikan = dipilih
    .filter((s) => s.panjang_dari === "ketikan")
    .reduce((n, s) => n + (s.panjang_pakai_km ?? 0), 0);
  const tanpaPanjang = dipilih.filter((s) => s.panjang_dari === "kosong").length;
  const tanpaRegu = dipilih.filter((s) => !bagi[s.segmen_id]).length;

  /** Km yang akan dipikul tiap regu — supaya pembagian timpang terlihat. */
  const bebanRegu = useMemo(() => {
    const n: Record<string, number> = {};
    for (const s of dipilih) {
      const g = bagi[s.segmen_id];
      if (g) n[g] = (n[g] ?? 0) + (s.panjang_pakai_km ?? 0);
    }
    return n;
  }, [dipilih, bagi]);

  const targetNum = Number(target.replace(",", ".")) || 0;
  const siap =
    !!ulp &&
    dipilih.length > 0 &&
    (mode === "baru" ? nama.trim().length > 2 && targetNum > 0 : !!woTujuan);

  const petaRegu = () =>
    Object.fromEntries(
      dipilih.filter((s) => bagi[s.segmen_id]).map((s) => [s.segmen_id, bagi[s.segmen_id]]),
    );

  const kirim = async () => {
    setSibuk(true);
    const h =
      mode === "baru"
        ? await onTerbitkan({
            ulp,
            nama: nama.trim(),
            targetKm: targetNum,
            segmen: dipilih.map((s) => s.segmen_id),
            regu: petaRegu(),
            tglWo: tgl,
          })
        : await onTambah!({
            woId: woTujuan,
            segmen: dipilih.map((s) => s.segmen_id),
            regu: petaRegu(),
            // Kosong = biarkan targetnya apa adanya. Menaikkannya opsional
            // supaya WO bertarget 2 km yang diisi 12 km tidak menampilkan
            // capaian 600% — angka yang benar secara hitungan tapi tidak
            // berarti apa-apa bagi yang membacanya.
            targetKm: targetNum > 0 ? targetNum : null,
          });
    setSibuk(false);
    if (h) {
      setPilih(new Set());
      setBagi({});
      setNama("");
      setTarget("");
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>{istilah.judul}</p>
        <p className="text-xs text-ink-soft mt-1 max-w-3xl">
          Satu WO boleh memuat segmen dari beberapa penyulang, dan boleh terbit beberapa kali
          sebulan. Ukurannya <b>total kilometer</b> — bukan jumlah segmen, karena ruas 7 km dan
          ruas 0,3 km bukan pekerjaan yang sebanding.
        </p>

        {onTambah && <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["baru", "Buat WO baru"],
              ["tambah", "Tambah ke WO yang sudah ada"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              disabled={k === "tambah" && woUlp.length === 0}
              className={`${CHIP} ${mode === k ? CHIP_ON : CHIP_OFF} disabled:opacity-40`}
              title={
                k === "tambah" && woUlp.length === 0
                  ? "Belum ada WO berjalan di ULP ini"
                  : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className={EYEBROW}>ULP</label>
            <select
              value={ulp}
              onChange={(e) => {
                setUlp(e.target.value);
                setPilih(new Set());
              }}
              disabled={!bolehSemua}
              className={`${FIELD} mt-1 block w-[170px] disabled:opacity-60`}
            >
              <option value="">— pilih ULP —</option>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          {mode === "baru" ? (
            <>
              <div>
                <label className={EYEBROW}>Nama WO</label>
                <input
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder={istilah.contohNama}
                  className={`${FIELD} mt-1 block w-[250px]`}
                />
              </div>
              <div>
                <label className={EYEBROW}>Target (km)</label>
                <input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="25"
                  className={`${FIELD} mt-1 block w-[110px] text-right font-mono`}
                />
              </div>
              <div>
                <label className={EYEBROW}>Tanggal WO</label>
                <input
                  type="date"
                  value={tgl}
                  onChange={(e) => setTgl(e.target.value)}
                  className={`${FIELD} mt-1 block w-[160px]`}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className={EYEBROW}>WO tujuan</label>
                <select
                  value={woTujuan}
                  onChange={(e) => setWoTujuan(e.target.value)}
                  className={`${FIELD} mt-1 block w-[280px]`}
                >
                  <option value="">— pilih WO —</option>
                  {woUlp.map((w) => (
                    <option key={w.wo_id} value={w.wo_id}>
                      {w.nama} · {w.tgl_wo} · {w.item} segmen
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={EYEBROW}>Ubah target (km)</label>
                <input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={woDipilih ? woDipilih.target_km.toFixed(2) : "opsional"}
                  className={`${FIELD} mt-1 block w-[130px] text-right font-mono`}
                />
              </div>
            </>
          )}
        </div>

        {/* Isi WO tujuan diperlihatkan apa adanya. Menambah segmen ke WO yang
            sudah penuh tanpa melihat isinya adalah cara paling mudah membuat
            targetnya jadi angka yang tidak berarti apa-apa. */}
        {mode === "tambah" && woDipilih && (
          <p className="text-xs text-ink-soft mt-3">
            <b className="text-ink">{woDipilih.nama}</b> sekarang berisi {woDipilih.item} segmen ·{" "}
            rencana <b className="text-ink tabular-nums">{woDipilih.rencana_km.toFixed(2)}</b> km
            dari target {woDipilih.target_km.toFixed(2)} km
            {totalKm > 0 && (
              <>
                {" → jadi "}
                <b className="text-ink tabular-nums">
                  {(woDipilih.rencana_km + totalKm).toFixed(2)}
                </b>{" "}
                km
                {targetNum === 0 && woDipilih.rencana_km + totalKm > woDipilih.target_km && (
                  <span className="text-amber-700">
                    {" "}
                    — melewati target; isi “Ubah target” kalau memang naik
                  </span>
                )}
              </>
            )}
          </p>
        )}
      </div>

      {/* Angka berjalan, menempel di atas daftar supaya terbaca saat mencentang
          — bukan setelah menggulir ke bawah. */}
      <div className={`${CARD} p-4 sticky top-2 z-10`}>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="text-sm">
            <b className="text-ink tabular-nums text-lg">{dipilih.length}</b>{" "}
            <span className="text-ink-soft">segmen dipilih</span>
          </span>
          <span className="text-sm">
            <b className="text-ink tabular-nums text-lg">{totalKm.toFixed(2)}</b>{" "}
            <span className="text-ink-soft">km</span>
            {targetNum > 0 && (
              <span className={`ml-1.5 text-xs ${totalKm > targetNum ? "text-amber-700" : "text-ink-muted"}`}>
                dari target {targetNum.toFixed(2)} km
              </span>
            )}
          </span>
          {kmKetikan > 0 && (
            <span className="text-xs text-amber-700">
              ✎ <b className="tabular-nums">{kmKetikan.toFixed(2)}</b> km masih angka ketikan
            </span>
          )}
          {tanpaPanjang > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-red-700">
              <FileWarning size={13} />
              {tanpaPanjang} segmen belum punya panjang — menyumbang 0 km ke rencana
            </span>
          )}
          {tanpaRegu > 0 && istilah.reguWajib && (
            <span className="inline-flex items-center gap-1 text-xs text-red-700">
              <Users size={13} />
              {tanpaRegu} belum dibagi regu — tidak akan muncul di HP siapa pun
            </span>
          )}
          <button
            onClick={() => void kirim()}
            disabled={!siap || sibuk}
            className={`${BTN_PRIMARY} ml-auto`}
          >
            {sibuk ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {mode === "baru" ? "Terbitkan WO" : "Tambahkan ke WO"}
          </button>
        </div>
      </div>

      {dipilih.length > 0 && reguUlp.length > 0 && (
        <div className={`${CARD} p-4`}>
          <p className={EYEBROW}>Bagi ke regu</p>
          <p className="text-[11px] text-ink-muted mt-1">
            {istilah.reguWajib
              ? "Tiap segmen hanya muncul di HP regu yang ditugasi — sepola temuan, tidak bercampur. Yang tidak dibagi tidak muncul di mana pun."
              : "Opsional. Semua tim se-ULP tetap bisa mengerjakannya; tim yang ditugasi melihatnya ditandai \"untuk tim ini\"."}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-soft">Semua yang dipilih ke:</span>
            {reguUlp.map((g) => (
              <button
                key={g.regu}
                onClick={() =>
                  setBagi((p) => ({
                    ...p,
                    ...Object.fromEntries(dipilih.map((s) => [s.segmen_id, g.regu])),
                  }))
                }
                className={`${CHIP} ${CHIP_OFF}`}
              >
                {g.regu}
                {/* Beban yang SUDAH dipikul regu itu di WO lain. Tanpa angka ini,
                    pembagian terasa adil di layar ini padahal satu regu sedang
                    memikul tiga WO sekaligus. */}
                {g.km_berjalan > 0 && (
                  <span className="text-ink-muted">+{Number(g.km_berjalan).toFixed(1)} km berjalan</span>
                )}
              </button>
            ))}
            <button onClick={() => setBagi({})} className={`${CHIP} ${CHIP_OFF}`}>
              Kosongkan
            </button>
          </div>

          {Object.keys(bebanRegu).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(bebanRegu)
                .sort((a, b) => b[1] - a[1])
                .map(([g, km]) => (
                  <span key={g} className="text-xs text-ink-soft">
                    <b className="text-ink">{g}</b> {km.toFixed(2)} km
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSaringPenyulang("")}
            className={`${CHIP} ${saringPenyulang === "" ? CHIP_ON : CHIP_OFF}`}
          >
            Semua penyulang
          </button>
          {daftarPenyulang.map((p) => (
            <button
              key={p}
              onClick={() => setSaringPenyulang(p)}
              className={`${CHIP} ${saringPenyulang === p ? CHIP_ON : CHIP_OFF}`}
            >
              {p}
            </button>
          ))}
        </div>

        {ulp && reguUlp.length === 0 && (
          <p className={`text-xs mt-3 ${istilah.reguWajib ? "text-red-700" : "text-ink-muted"}`}>
            {istilah.reguKosong(ulp)}
          </p>
        )}

        {!ulp ? (
          <p className="text-xs text-ink-muted py-10 text-center">Pilih ULP dulu.</p>
        ) : tersedia.length === 0 ? (
          <p className="text-xs text-ink-muted py-10 text-center">
            Tidak ada segmen yang bisa dipilih. Yang sudah terikat WO lain tidak muncul di sini —
            batalkan dulu di sana kalau memang mau dipindahkan.
          </p>
        ) : (
          <div className="mt-3 space-y-1">
            {tersedia.map((s) => {
              const aktif = pilih.has(s.segmen_id);
              return (
                <label
                  key={s.segmen_id}
                  className={`flex flex-wrap items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                    aktif ? "border-navy-300 bg-navy-50/50" : "border-line hover:bg-surface"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={aktif}
                    onChange={() =>
                      setPilih((prev) => {
                        const n = new Set(prev);
                        n.has(s.segmen_id) ? n.delete(s.segmen_id) : n.add(s.segmen_id);
                        return n;
                      })
                    }
                    className="accent-navy-600"
                  />
                  <span className="text-xs text-ink-soft w-[130px] truncate">{s.penyulang}</span>
                  <span className="text-sm text-ink flex-1 min-w-[200px]">{s.nama}</span>
                  <span className="text-sm font-mono tabular-nums text-ink w-[80px] text-right">
                    {s.panjang_pakai_km !== null ? s.panjang_pakai_km.toFixed(2) : "—"}
                    {s.panjang_dari === "ketikan" && <span className="text-amber-600"> ✎</span>}
                  </span>
                  <span className="w-[110px] text-right text-[11px]">
                    {s.umur_inspeksi_bulan === null ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                        <TriangleAlert size={11} /> belum diinspeksi
                      </span>
                    ) : (
                      <span className="text-ink-muted">{s.umur_inspeksi_bulan} bln lalu</span>
                    )}
                  </span>

                  {/* Hanya muncul setelah dicentang: dropdown di baris yang tidak
                      dipilih cuma menambah kebisingan pada daftar yang sudah panjang. */}
                  {aktif && reguUlp.length > 0 && (
                    <select
                      value={bagi[s.segmen_id] ?? ""}
                      onChange={(e) =>
                        setBagi((p) => ({ ...p, [s.segmen_id]: e.target.value }))
                      }
                      onClick={(e) => e.preventDefault()}
                      className={`${FIELD} w-[120px] h-8 text-xs ${
                        bagi[s.segmen_id] || !istilah.reguWajib ? "" : "border-red-300 text-red-700"
                      }`}
                    >
                      <option value="">{istilah.reguWajib ? "— belum dibagi —" : "— semua tim —"}</option>
                      {reguUlp.map((g) => (
                        <option key={g.regu} value={g.regu}>
                          {g.regu}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
