/**
 * Latar "jaringan hidup" — kisi + kabel + pulsa listrik + simpul gardu.
 * Murni CSS/SVG (keyframes di globals.css); tanpa JS animasi, tanpa canvas.
 *
 * Posisi sengaja tetap (bukan acak) agar render server dan klien identik.
 */

/** Simpul gardu: posisi (%) + jeda denyut (detik). */
const NODES: { x: number; y: number; d: number }[] = [
  { x: 12, y: 22, d: 0 },
  { x: 27, y: 68, d: 1.2 },
  { x: 46, y: 14, d: 2.1 },
  { x: 68, y: 78, d: 0.6 },
  { x: 82, y: 34, d: 1.7 },
  { x: 92, y: 62, d: 2.6 },
];

/** Jalur kabel — satu path dipakai dua kali: garis diam + pulsa berjalan. */
const WIRES: { d: string; dur: number; delay: number }[] = [
  { d: "M 4 26 C 26 8, 42 34, 62 18 S 88 40, 100 28", dur: 7, delay: 0 },
  { d: "M 0 72 C 22 60, 34 86, 56 74 S 84 58, 100 70", dur: 9, delay: 1.8 },
  { d: "M 8 48 C 30 42, 50 56, 72 46 S 92 52, 100 44", dur: 8, delay: 3.6 },
];

export default function GridBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Kisi bergeser */}
      <div className="lg-grid absolute -inset-16 opacity-70" />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {WIRES.map((w, i) => (
          <g key={i}>
            {/* Kabel diam */}
            <path
              d={w.d}
              fill="none"
              stroke="rgb(94 234 212 / 0.15)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {/* Pulsa: dash pendek yang berjalan menyusuri kabel yang sama */}
            <path
              className="lg-pulse"
              d={w.d}
              fill="none"
              stroke="#5eead4"
              strokeWidth={2}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pathLength={100}
              strokeDasharray="6 100"
              style={{ animationDuration: `${w.dur}s`, animationDelay: `${w.delay}s` }}
            />
          </g>
        ))}
      </svg>

      {/* Simpul gardu berdenyut */}
      {NODES.map((n, i) => (
        <span
          key={i}
          className="lg-node absolute h-1.5 w-1.5 rounded-full bg-[#5eead4]"
          style={{
            left: `${n.x}%`,
            top: `${n.y}%`,
            animationDelay: `${n.d}s`,
            boxShadow: "0 0 8px 2px rgb(94 234 212 / 0.4)",
          }}
        />
      ))}

      {/* Vignette — menenangkan bagian tengah supaya teks tetap terbaca */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_28%,rgb(11_20_40/0.78)_100%)]" />
    </div>
  );
}
