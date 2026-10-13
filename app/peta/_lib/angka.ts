/** Angka berformat Indonesia: 1.234,56 (d = jumlah desimal tetap). */
export const angka = (n: number, d = 0) =>
  n.toLocaleString("id-ID", { maximumFractionDigits: d, minimumFractionDigits: d });
