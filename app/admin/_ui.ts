// Kelas bersama modul Work Order — supaya pola yang dipakai berulang
// tidak diduplikasi di tiap komponen. Token warna/shadow-nya di globals.css (@theme).

/** Kartu putih mengapung di atas surface abu. */
export const CARD = "bg-white rounded-2xl border border-line shadow-card";

/** Kartu yang bisa diklik — mengangkat saat hover. */
export const CARD_LIFT =
  "bg-white rounded-2xl border border-line shadow-card hover:shadow-card-hover hover:border-navy-200 transition-all";

/** Judul & angka besar memakai font display. */
export const DISPLAY = "font-display tracking-tight";

/** Input & select tinggi 36px. */
export const FIELD =
  "h-9 rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 transition-colors";

export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold bg-navy-600 text-white hover:bg-navy-500 active:bg-navy-700 disabled:opacity-40 transition-colors";

export const BTN_GHOST =
  "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-sm font-medium text-ink-soft border border-line bg-white hover:bg-surface disabled:opacity-40 transition-colors";

/** Tombol di atas latar navy (header). */
export const BTN_ON_NAVY =
  "inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-sm font-medium bg-white/12 text-white hover:bg-white/20 disabled:opacity-50 transition-colors";

/** Chip pil — dasar untuk filter & tag. */
export const CHIP =
  "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border transition-colors whitespace-nowrap";

export const CHIP_OFF = "bg-white border-line text-ink-soft hover:border-navy-300";
export const CHIP_ON = "bg-navy-600 border-navy-600 text-white";

/** Label bagian kecil huruf besar. */
export const EYEBROW =
  "text-[11px] font-semibold uppercase tracking-wide text-ink-muted";

/** Bilah judul panel — navy seragam supaya identitas panel datang dari
 *  ikon & teksnya, bukan dari warna latar yang berbeda-beda. */
export const PANEL_HEAD =
  "bg-navy-600 px-4 py-2.5 flex items-center gap-2 shrink-0";
