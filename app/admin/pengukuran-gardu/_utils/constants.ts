export const JENIS_PEMELIHARAAN_OPTIONS = [
  "PEMERATAAN BEBAN",
  "OPTIMASI TRAFO",
  "PEMELIHARAAN GARDU",
  "MANUVER BEBAN",
] as const;

export type JenisPemeliharaan = typeof JENIS_PEMELIHARAAN_OPTIONS[number];
