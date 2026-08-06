/**
 * Pola arsir diagonal untuk batang grafik — SATU resep untuk seluruh aplikasi.
 *
 * Isian bergaris menurunkan bobot visual grafik sehingga tidak menenggelamkan
 * kartu di sekitarnya, tapi bentuk batangnya tetap terbaca. Supaya tetap
 * kontras di permukaan terang, arsirnya berdiri di atas dasar bertinta tipis
 * dari warna yang sama — hanya garis saja terbaca terlalu pucat.
 *
 * Dipisah setelah pola ini dipakai di lima grafik (tren gangguan dashboard,
 * dua grafik SLA yantek, grafik per petugas, dan dua grafik pengukuran gardu):
 * lima salinan angka opacity dan jarak garis adalah lima kesempatan untuk
 * menyimpang satu sama lain.
 *
 * Pakai di dalam <defs> milik chart Recharts:
 *
 *   <defs>
 *     <ArsirPattern id="arsirBeban" warna={STATUS_COLOR.aman} />
 *   </defs>
 *   <Bar fill={arsir("arsirBeban")} stroke={STATUS_COLOR.aman} strokeWidth={1.25} />
 */

interface ArsirPatternProps {
  /** Harus unik dalam satu halaman — id SVG bersifat global. */
  id: string;
  /** Hex warna seri; dipakai untuk dasar bertinta sekaligus garisnya. */
  warna: string;
  /** Kepekatan dasar. Naikkan (mis. 0,28) untuk menandai ember yang belum genap. */
  opacity?: number;
  /** Jarak antar garis. Perkecil (mis. 4) untuk arsir yang lebih rapat. */
  jarak?: number;
}

export default function ArsirPattern({
  id, warna, opacity = 0.14, jarak = 6,
}: ArsirPatternProps) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={jarak}
      height={jarak}
      patternTransform="rotate(45)"
    >
      <rect width={jarak} height={jarak} fill={warna} fillOpacity={opacity} />
      <line x1={0} y1={0} x2={0} y2={jarak} stroke={warna} strokeWidth={2} />
    </pattern>
  );
}

/** Rujukan isian untuk prop `fill` Recharts. */
export const arsir = (id: string) => `url(#${id})`;
