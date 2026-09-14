"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, MapPinOff, MousePointerSquareDashed, Plus, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { type CurrentUser, canSeeAllUnits, UNITS } from "@/lib/roles";
import { BTN_GHOST, BTN_PRIMARY, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { useTiangJtm } from "../_hooks/useTiangJtm";
import { useSegmen } from "../_hooks/useSegmen";
import { useJtmRef } from "../_hooks/useJtmRef";
import SegmenModal from "./SegmenModal";

const PetaJtmInner = dynamic(() => import("./PetaJtmInner"), {
  ssr: false,
  loading: () => <div className="h-full rounded-xl border border-line bg-surface animate-pulse" />,
});

/** Leaflet mulai tersendat di atas beberapa ratus penanda, dan peta yang macet
 *  lebih buruk daripada peta yang meminta disaring dulu. */
const BATAS_GAMBAR = 1500;

/** Sekali kirim ke PostgREST. Ratusan baris dalam satu permintaan lebih cepat
 *  daripada ratusan permintaan, tapi satu permintaan raksasa lebih mudah gagal
 *  di tengah — dan yang gagal di tengah paling repot dibereskan. */
const SEPOTONG = 200;

export default function PetaJtm({ user }: { user: CurrentUser }) {
  const toast = useToast();
  const [ulp, setUlp] = useState("");
  const [penyulang, setPenyulang] = useState("");
  const [mode, setMode] = useState<"lihat" | "tandai">("lihat");
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const [segmenTujuan, setSegmenTujuan] = useState("");
  const [modalSegmen, setModalSegmen] = useState(false);
  const [tandaTujuan, setTandaTujuan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const { tiang, penyulangList, loading, muat } = useTiangJtm(user, ulp);
  const { per: pilihanRef, penanda } = useJtmRef();
  const {
    baris: segmenList,
    penyulangList: penyulangMaster,
    buat,
    muat: muatSegmen,
  } = useSegmen(user, ulp);

  /**
   * KOSONG sampai penyulang dipilih — disengaja.
   *
   * Satu ULP bisa punya ribuan tiang, dan menggambar semuanya begitu tab dibuka
   * membuat peta tersendat justru pada detik pertama orang melihatnya. Lagipula
   * pertanyaan yang dibawa orang ke peta ini selalu tentang SATU penyulang.
   */
  const tersaring = useMemo(
    () => (penyulang ? tiang.filter((t) => t.penyulang === penyulang) : []),
    [tiang, penyulang],
  );
  const bertitik = useMemo(
    () => tersaring.filter((t) => t.lat !== null && t.lng !== null),
    [tersaring],
  );

  const segmenPenyulang = useMemo(
    () => segmenList.filter((s) => !penyulang || s.penyulang === penyulang),
    [segmenList, penyulang],
  );

  const pilihan = useMemo(
    () => bertitik.filter((t) => terpilih.has(t.id)),
    [bertitik, terpilih],
  );
  const belumBersegmen = pilihan.filter((t) => t.segmenIds.length === 0).length;
  const sudahDiTujuan = segmenTujuan
    ? pilihan.filter((t) => t.segmenIds.includes(segmenTujuan)).length
    : 0;

  const ubahPilihan = (ids: string[], cara: "ganti" | "alih") => {
    setTerpilih((s) => {
      if (cara === "ganti") return new Set(ids);
      const baru = new Set(s);
      for (const id of ids) {
        if (baru.has(id)) baru.delete(id);
        else baru.add(id);
      }
      return baru;
    });
  };

  const masukkan = async () => {
    if (!segmenTujuan || pilihan.length === 0) return;
    setSibuk(true);
    try {
      const baris = pilihan
        .filter((t) => !t.segmenIds.includes(segmenTujuan))
        .map((t) => ({ segmen_id: segmenTujuan, tiang_id: t.id, sumber: "peta" }));

      for (let i = 0; i < baris.length; i += SEPOTONG) {
        const { error } = await supabaseBrowser
          .from("segmen_tiang")
          .upsert(baris.slice(i, i + SEPOTONG), { onConflict: "segmen_id,tiang_id" });
        if (error) throw new Error(error.message);
      }
      toast.success(`${baris.length} tiang masuk segmen.`);
      setTerpilih(new Set());
      await Promise.all([muat(), muatSegmen()]);
    } catch (e) {
      toast.error(`Gagal memasukkan: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSibuk(false);
    }
  };

  const beriTanda = async (kode: string | null) => {
    if (pilihan.length === 0) return;
    setSibuk(true);
    try {
      const ids = pilihan.map((t) => t.id);
      for (let i = 0; i < ids.length; i += SEPOTONG) {
        const { error } = await supabaseBrowser
          .from("tiang")
          .update({ penanda: kode, updated_at: new Date().toISOString() })
          .in("id", ids.slice(i, i + SEPOTONG));
        if (error) throw new Error(error.message);
      }
      toast.success(
        kode
          ? `${ids.length} tiang ditandai ${pilihanRef("penanda").find((x) => x.kode === kode)?.label ?? kode}.`
          : `Penanda dilepas dari ${ids.length} tiang.`,
      );
      setTerpilih(new Set());
      await muat();
    } catch (e) {
      toast.error(`Gagal menandai: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSibuk(false);
    }
  };

  const keluarkan = async () => {
    if (!segmenTujuan || sudahDiTujuan === 0) return;
    setSibuk(true);
    try {
      const ids = pilihan.filter((t) => t.segmenIds.includes(segmenTujuan)).map((t) => t.id);
      for (let i = 0; i < ids.length; i += SEPOTONG) {
        const { error } = await supabaseBrowser
          .from("segmen_tiang")
          .delete()
          .eq("segmen_id", segmenTujuan)
          .in("tiang_id", ids.slice(i, i + SEPOTONG));
        if (error) throw new Error(error.message);
      }
      toast.success(`${ids.length} tiang dikeluarkan dari segmen.`);
      setTerpilih(new Set());
      await Promise.all([muat(), muatSegmen()]);
    } catch (e) {
      toast.error(`Gagal mengeluarkan: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSibuk(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat tiang…
      </div>
    );
  }

  const terlaluBanyak = bertitik.length > BATAS_GAMBAR;
  const siapMenandai = penyulang !== "";

  return (
    <div className="flex flex-col gap-3 h-full min-h-[420px]">
      <div className={`${CARD} px-4 py-3 flex flex-wrap items-end gap-3 shrink-0`}>
        <div>
          <p className={EYEBROW}>Penyulang</p>
          <select
            value={penyulang}
            onChange={(e) => {
              setPenyulang(e.target.value);
              setTerpilih(new Set());
              setSegmenTujuan("");
            }}
            className={`${FIELD} mt-1 block max-w-[220px]`}
          >
            <option value="">Semua penyulang</option>
            {penyulangList.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {canSeeAllUnits(user.role) && (
          <div>
            <p className={EYEBROW}>ULP</p>
            <select
              value={ulp}
              onChange={(e) => setUlp(e.target.value)}
              className={`${FIELD} mt-1 block`}
            >
              <option value="">Semua ULP</option>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={() => {
            setMode((m) => (m === "tandai" ? "lihat" : "tandai"));
            setTerpilih(new Set());
          }}
          className={mode === "tandai" ? BTN_PRIMARY : BTN_GHOST}
        >
          <MousePointerSquareDashed size={16} />
          {mode === "tandai" ? "Selesai menandai" : "Tandai segmen"}
        </button>

        <p className="text-xs text-ink-muted ml-auto">
          {bertitik.length.toLocaleString("id-ID")} tiang bertitik
          {tersaring.length !== bertitik.length &&
            ` · ${(tersaring.length - bertitik.length).toLocaleString("id-ID")} tanpa titik`}
        </p>
      </div>

      {/* ── Bilah penandaan ── */}
      {mode === "tandai" && (
        <div className={`${CARD} px-4 py-3 shrink-0`}>
          {!siapMenandai ? (
            <p className="text-xs text-ink-soft">
              Pilih <b>satu penyulang</b> dulu. Segmen selalu milik satu penyulang, dan menarik
              kotak di atas beberapa penyulang sekaligus hampir pasti ikut menyeret tiang yang
              bukan miliknya.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className={EYEBROW}>Terpilih</p>
                <p className="text-lg font-semibold text-ink tabular-nums leading-tight">
                  {pilihan.length.toLocaleString("id-ID")}
                  <span className="text-xs font-normal text-ink-muted ml-2">
                    {belumBersegmen} belum bersegmen
                  </span>
                </p>
              </div>

              <div className="flex-1 min-w-[220px]">
                <p className={EYEBROW}>Masukkan ke segmen</p>
                <div className="flex gap-2 mt-1">
                  <select
                    value={segmenTujuan}
                    onChange={(e) => setSegmenTujuan(e.target.value)}
                    className={`${FIELD} flex-1`}
                  >
                    <option value="">— pilih segmen —</option>
                    {segmenPenyulang.map((s) => (
                      <option key={s.segmen_id} value={s.segmen_id}>
                        {s.nama} ({s.jumlah_tiang} tiang)
                      </option>
                    ))}
                  </select>
                  <button onClick={() => setModalSegmen(true)} className={BTN_GHOST}>
                    <Plus size={15} /> Baru
                  </button>
                </div>
              </div>

              <div>
                <button
                  onClick={() => void masukkan()}
                  disabled={!segmenTujuan || pilihan.length === 0 || sibuk}
                  className={BTN_PRIMARY}
                  title={
                    pilihan.length === 0
                      ? "Belum ada tiang terpilih — tarik kotak di peta dulu"
                      : !segmenTujuan
                        ? "Pilih segmen tujuan dulu"
                        : undefined
                  }
                >
                  {sibuk && <Loader2 size={15} className="animate-spin" />}
                  Masukkan {pilihan.length > 0 ? `${pilihan.length - sudahDiTujuan}` : ""}
                </button>
                {/* Tombol mati yang diam adalah tombol yang menipu: orang
                    menekannya, tidak terjadi apa-apa, dan menyangka sudah
                    tersimpan. */}
                {(pilihan.length === 0 || !segmenTujuan) && (
                  <p className="text-[11px] text-attention mt-1">
                    {pilihan.length === 0
                      ? "Tarik kotak di peta untuk memilih tiang"
                      : "Pilih segmen tujuannya dulu"}
                  </p>
                )}
              </div>

              {sudahDiTujuan > 0 && (
                <button onClick={() => void keluarkan()} disabled={sibuk} className={BTN_GHOST}>
                  Keluarkan {sudahDiTujuan}
                </button>
              )}

              {/* Penanda tiang: gardu, LBS, recloser. Bukan hasil pemeriksaan —
                  ini patokan yang membuat orang mengenali ruas di peta. */}
              <div className="flex items-end gap-2">
                <div>
                  <p className={EYEBROW}>Tandai tiang</p>
                  <select
                    value={tandaTujuan}
                    onChange={(e) => setTandaTujuan(e.target.value)}
                    className={`${FIELD} mt-1 w-[170px]`}
                  >
                    <option value="">— pilih penanda —</option>
                    {pilihanRef("penanda", true).map((x) => (
                      <option key={x.kode} value={x.kode}>
                        {x.label}
                      </option>
                    ))}
                    <option value="__lepas">(lepas penanda)</option>
                  </select>
                </div>
                <button
                  onClick={() => void beriTanda(tandaTujuan === "__lepas" ? null : tandaTujuan)}
                  disabled={!tandaTujuan || pilihan.length === 0 || sibuk}
                  className={BTN_GHOST}
                >
                  Terapkan
                </button>
              </div>

              {pilihan.length > 0 && (
                <button onClick={() => setTerpilih(new Set())} className={BTN_GHOST}>
                  <X size={15} /> Kosongkan
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!penyulang ? (
        <div className={`${CARD} flex-1 flex flex-col items-center justify-center gap-2 text-center`}>
          <MapPinOff size={32} className="text-ink-muted" />
          <p className="text-sm text-ink-soft max-w-md">
            Pilih <b>satu penyulang</b> untuk menggambar jaringannya. Peta sengaja dibiarkan
            kosong saat dibuka — satu ULP bisa berisi ribuan tiang, dan menggambar semuanya
            membuat peta tersendat tepat pada detik pertama dilihat.
          </p>
        </div>
      ) : bertitik.length === 0 ? (
        <div className={`${CARD} flex-1 flex flex-col items-center justify-center gap-2 text-center`}>
          <MapPinOff size={32} className="text-ink-muted" />
          <p className="text-sm text-ink-soft max-w-md">
            Belum ada tiang bertitik untuk penyulang ini. Impor tiang dulu di tab sebelah, atau
            tunggu regu menyapu di lapangan.
          </p>
        </div>
      ) : terlaluBanyak ? (
        <div className={`${CARD} flex-1 flex flex-col items-center justify-center gap-2 text-center`}>
          <p className="text-sm text-ink-soft max-w-md">
            {bertitik.length.toLocaleString("id-ID")} tiang terlalu banyak untuk digambar
            sekaligus. Saring penyulangnya dulu — peta yang macet lebih buruk daripada peta yang
            meminta disaring.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <PetaJtmInner
            tiang={bertitik}
            mode={mode}
            terpilih={terpilih}
            onUbahPilihan={ubahPilihan}
            penanda={penanda}
          />
        </div>
      )}

      {modalSegmen && (
        <SegmenModal
          penyulangList={penyulangMaster}
          segmenAda={segmenList}
          ulpAwal={canSeeAllUnits(user.role) ? ulp : (user.unit ?? "")}
          // Segmen yang baru dibuat dari peta LANGSUNG jadi tujuan. Tanpa ini,
          // orang membuat segmen lalu menekan "Masukkan" yang diam saja —
          // tombolnya mati karena tujuannya belum dipilih, dan tidak ada yang
          // memberi tahu. Itu persis yang bikin segmen kedua kosong.
          onSimpan={async (v) => {
            const id = await buat(v);
            if (id) setSegmenTujuan(id);
            return !!id;
          }}
          onTutup={() => setModalSegmen(false)}
        />
      )}
    </div>
  );
}
