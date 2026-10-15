"use client";

import type { useLapisanKesehatan, useLapisanPohon, useLapisanUjung } from "../_hooks/useLapisanTambahan";
import PanelKesehatan from "./PanelKesehatan";
import PanelPohon from "./PanelPohon";
import PanelUjung from "./PanelUjung";

/**
 * Tumpukan panel saringan di kanan peta untuk lapisan yang sedang menyala:
 * kesehatan gardu, pohon, tegangan ujung. Bergulir sendiri bila tidak muat.
 */

interface Props {
  kesehatan: ReturnType<typeof useLapisanKesehatan>;
  pohon: ReturnType<typeof useLapisanPohon>;
  pohonAktif: boolean;
  onTutupPohon: () => void;
  ujung: ReturnType<typeof useLapisanUjung>;
  /** Admin ULP & UP3: boleh menugaskan pohon ke regu. */
  boleh: boolean;
}

export default function PanelKanan({ kesehatan, pohon, pohonAktif, onTutupPohon, ujung, boleh }: Props) {
  if (!ujung.aktif && !kesehatan.aktif && !pohonAktif) return null;
  return (
    <div className="absolute z-[1050] top-14 right-3 bottom-3 flex flex-col gap-2 overflow-y-auto pointer-events-none [&>*]:pointer-events-auto">
      {kesehatan.aktif && (
        <PanelKesehatan
          saring={kesehatan.saring}
          onSaring={kesehatan.setSaring}
          hitung={kesehatan.hitung}
          jumlah={kesehatan.gardu.length}
          sibuk={kesehatan.sibuk}
          galat={kesehatan.galat}
          onTutup={() => kesehatan.setAktif(false)}
        />
      )}
      {pohonAktif && (
        <PanelPohon
          tahun={pohon.bulan.tahun}
          bulan={pohon.bulan.bulan}
          onBulan={(tahun, bulan) => pohon.setBulan({ tahun, bulan })}
          saring={pohon.saring}
          onSaring={pohon.setSaring}
          jumlah={pohon.temuan.length + pohon.dirabas.length + pohon.cek.length}
          total={pohon.total}
          tertangani={pohon.tertangani}
          sibuk={pohon.sibuk}
          galat={pohon.galat}
          onTutup={onTutupPohon}
          bisaDitugaskan={pohon.bisaDitugaskan.length}
          onTugaskanSemua={boleh ? () => pohon.setTugas(pohon.bisaDitugaskan) : undefined}
        />
      )}
      {ujung.aktif && (
        <PanelUjung
          tahun={ujung.bulan.tahun}
          bulan={ujung.bulan.bulan}
          onBulan={(tahun, bulan) => ujung.setBulan({ tahun, bulan })}
          saring={ujung.saring}
          onSaring={ujung.setSaring}
          jumlah={ujung.titik.length}
          total={ujung.total}
          sibuk={ujung.sibuk}
          galat={ujung.galat}
          tanpaGardu={ujung.titik.filter((t) => t.gardu_lat === null || t.gardu_lng === null).length}
          onTutup={() => ujung.setAktif(false)}
        />
      )}
    </div>
  );
}
