"use client";

import { useState } from "react";
import { Network, Upload } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useMasterSegmen } from "./_hooks/useMasterSegmen";
import DaftarSegmen from "./_components/DaftarSegmen";
import ImporSegmen from "./_components/ImporSegmen";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import TabPil from "@/app/admin/_kit/TabPil";

/**
 * Master Segmen — daftar acuan ruas jaringan.
 *
 * Melayani DUA modul sekaligus: WO inspeksi JTM dan WO perabasan. Karena itu
 * tempatnya di Master Data, bukan di dalam Jaringan JTM — menaruhnya di sana
 * menyembunyikannya dari regu rabas, yang justru paling sering memakainya.
 *
 * Tab Segmen di dalam Jaringan JTM tetap ada dan tidak bersaing dengan ini:
 * yang itu alat kerja JTM (merintis, menggabung), yang ini daftar acuannya.
 */

const TABS = [
  { key: "daftar", label: "Daftar Segmen", icon: Network },
  { key: "impor", label: "Impor Segmen", icon: Upload },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function MasterSegmenPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  const {
    baris, penyulang, daftarUlp, loading, yatim, sectionDari, rekapSection, garduSegmen, garduBelum, pratinjauImpor, impor, ubahPanjang, ubahNama, ubahTitik, tutupSegmen,
    pratinjauHapus, hapusSegmen,
  } = useMasterSegmen();

  const oleh = user.name ?? user.email;

  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiKepala>
        <TabPil tab={TABS.map((t) => ({ kunci: t.key, label: t.label, ikon: t.icon }))} aktif={tab} onPilih={setTab} />
      </IsiKepala>

      {tab === "daftar" && (
        <DaftarSegmen
          baris={baris}
          daftarUlp={daftarUlp}
          loading={loading}
          yatim={yatim}
          sectionDari={sectionDari}
          rekapSection={rekapSection}
          garduSegmen={garduSegmen}
          garduBelum={garduBelum}
          user={user}
          onUbahPanjang={(id, km) => ubahPanjang(id, km, oleh)}
          onUbahNama={(id, nama) => ubahNama(id, nama, oleh)}
          onUbahTitik={(id, ujung, jenis, nama) => ubahTitik(id, ujung, jenis, nama, oleh)}
          onTutupSegmen={(id, tiangId, jenis, nama, penanda) => tutupSegmen(id, tiangId, jenis, nama, penanda, oleh)}
          onPratinjauHapus={(id) => pratinjauHapus(id, oleh)}
          onHapus={(id, alasan) => hapusSegmen(id, alasan, oleh)}
        />
      )}
      {tab === "impor" && (
        <ImporSegmen
          user={user}
          penyulang={penyulang}
          onPratinjau={pratinjauImpor}
          onImpor={(p, isi) => impor(p, isi, oleh)}
        />
      )}
    </div>
  );
}
