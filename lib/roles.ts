// ============================================================
// Sistem Role & Unit — SMART Mataram
// Sumber kebenaran tunggal untuk semua konstanta role/unit
// ============================================================

// ── Types ────────────────────────────────────────────────────────────────────

export type Role =
  | "UP3"
  | "admin"
  | "inspektor"
  | "HARJAR"
  | "HARGAR"
  | "PERABASAN"
  | "YANGU"
  | "PDKB";

export type Unit = "AMPENAN" | "CAKRANEGARA" | "GERUNG" | "TANJUNG";

export type InspeksiStatus =
  | "Temuan"
  | "Perlu Tindakan"
  | "Ditugaskan"
  | "Dalam Proses"
  | "Selesai";

export type InspeksiCategory =
  | "Emergency"
  | "Urgent"
  | "Scheduled"
  | "Preventive"
  | "Normal";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  unit: Unit | null;
  platform: string;
  is_active: boolean;
}

// ── Units ────────────────────────────────────────────────────────────────────

export const UNITS: { value: Unit; label: string }[] = [
  { value: "AMPENAN", label: "ULP Ampenan" },
  { value: "CAKRANEGARA", label: "ULP Cakranegara" },
  { value: "GERUNG", label: "ULP Gerung" },
  { value: "TANJUNG", label: "ULP Tanjung" },
];

// ── Roles ─────────────────────────────────────────────────────────────────────

export const ROLES: {
  value: Role;
  label: string;
  description: string;
  needsUnit: boolean;
}[] = [
  {
    value: "UP3",
    label: "UP3",
    description: "Akses penuh semua unit, bisa filter per ULP",
    needsUnit: false,
  },
  {
    value: "admin",
    label: "Admin",
    description: "Admin per unit, akses penuh data unit sendiri",
    needsUnit: true,
  },
  {
    value: "inspektor",
    label: "Inspektor",
    description: "Input inspeksi, lihat data unit sendiri",
    needsUnit: true,
  },
  {
    value: "HARJAR",
    label: "HARJAR",
    description: "Pemeliharaan jaringan, lihat task yang ditugaskan ke HARJAR",
    needsUnit: true,
  },
  {
    value: "HARGAR",
    label: "HARGAR",
    description: "Pemeliharaan gardu, lihat task yang ditugaskan ke HARGAR",
    needsUnit: true,
  },
  {
    value: "PERABASAN",
    label: "PERABASAN",
    description: "Pembersihan vegetasi, lihat inspeksi pohon yang ditugaskan",
    needsUnit: true,
  },
  {
    value: "YANGU",
    label: "YANGU",
    description: "Konstruksi, lihat task yang ditugaskan ke YANGU",
    needsUnit: true,
  },
  {
    value: "PDKB",
    label: "PDKB",
    description: "Tim PDKB, lihat task yang ditugaskan ke PDKB",
    needsUnit: true,
  },
];

// ── Execution Teams (subset dari Role yang eksekutor) ────────────────────────

export const EKSEKUTOR_ROLES: Role[] = [
  "HARJAR",
  "HARGAR",
  "PERABASAN",
  "YANGU",
  "PDKB",
];

// ── Akses & Permission Helpers ───────────────────────────────────────────────

/** UP3 bisa lihat semua unit */
export const canSeeAllUnits = (role: Role) => role === "UP3";

/** Role yang bisa update status inspeksi */
export const canUpdateStatus = (role: Role) =>
  role === "UP3" || role === "admin" || EKSEKUTOR_ROLES.includes(role);

/** Role yang bisa assign eksekutor */
export const canAssignEksekutor = (role: Role) =>
  role === "UP3" || role === "admin";

/** Role yang bisa akses halaman admin (semua kecuali field staff murni) */
export const canAccessAdmin = (role: Role): boolean => true; // semua role bisa login ke admin

/** Role yang bisa manage settings (WA group, dll) */
export const canManageSettings = (role: Role) => role === "UP3" || role === "admin";

/** Filter data berdasarkan role dan unit user
 *
 * Pakai ini di setiap hook yang fetch data inspeksi/pohon:
 * ```ts
 * const query = buildUnitFilter(supabase.from('inspeksi').select('*'), user);
 * ```
 */
export function buildUnitFilter<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  user: CurrentUser
): T {
  // UP3: tidak ada filter unit
  if (canSeeAllUnits(user.role)) return query;

  // Semua role lain: filter berdasarkan unit
  if (user.unit) return query.eq("ulp", user.unit);

  return query;
}

// ── Status Inspeksi ───────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<
  InspeksiStatus,
  { label: string; color: string; bgColor: string; order: number }
> = {
  Temuan: {
    label: "Temuan",
    color: "text-red-700",
    bgColor: "bg-red-50",
    order: 1,
  },
  "Perlu Tindakan": {
    label: "Perlu Tindakan",
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    order: 2,
  },
  Ditugaskan: {
    label: "Ditugaskan",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    order: 3,
  },
  "Dalam Proses": {
    label: "Dalam Proses",
    color: "text-yellow-700",
    bgColor: "bg-yellow-50",
    order: 4,
  },
  Selesai: {
    label: "Selesai",
    color: "text-green-700",
    bgColor: "bg-green-50",
    order: 5,
  },
};

// ── Kategori ─────────────────────────────────────────────────────────────────

export const CATEGORY_CONFIG: Record<
  InspeksiCategory,
  { label: string; color: string; bgColor: string }
> = {
  Emergency: { label: "Emergency", color: "text-red-700", bgColor: "bg-red-100" },
  Urgent: { label: "Urgent", color: "text-orange-700", bgColor: "bg-orange-100" },
  Scheduled: { label: "Scheduled", color: "text-blue-700", bgColor: "bg-blue-100" },
  Preventive: { label: "Preventive", color: "text-purple-700", bgColor: "bg-purple-100" },
  Normal: { label: "Normal", color: "text-gray-700", bgColor: "bg-gray-100" },
};

// ── Tree Prediction ───────────────────────────────────────────────────────────

export const PREDIKSI_DAYS: Record<string, number> = {
  "1 hari": 1,
  "3 hari": 3,
  "1 minggu": 7,
  "2 minggu": 14,
  "1 bulan": 30,
  "2 bulan": 60,
  "3 bulan": 90,
};

export type UrgencyLevel = "SANGAT URGENT" | "URGENT" | "PERLU TINDAKAN" | "AMAN";

export const URGENCY_CONFIG: Record<
  UrgencyLevel,
  { label: string; color: string; bgColor: string; dotColor: string }
> = {
  "SANGAT URGENT": {
    label: "Sangat Urgent",
    color: "text-red-700",
    bgColor: "bg-red-100",
    dotColor: "bg-red-500",
  },
  URGENT: {
    label: "Urgent",
    color: "text-orange-700",
    bgColor: "bg-orange-100",
    dotColor: "bg-orange-500",
  },
  "PERLU TINDAKAN": {
    label: "Perlu Tindakan",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
    dotColor: "bg-yellow-500",
  },
  AMAN: {
    label: "Aman",
    color: "text-green-700",
    bgColor: "bg-green-100",
    dotColor: "bg-green-500",
  },
};

/** Hitung sisa hari dari tgl_inspeksi + prediksi_inspektur */
export function calcRemainingDays(
  tglInspeksi: string,
  prediksiInspektur: string
): number {
  const days = PREDIKSI_DAYS[prediksiInspektur] ?? 30;
  const inspeksiDate = new Date(tglInspeksi);
  const deadlineDate = new Date(inspeksiDate.getTime() + days * 86400000);
  const remaining = Math.ceil(
    (deadlineDate.getTime() - Date.now()) / 86400000
  );
  return remaining;
}

export function getUrgencyLevel(remainingDays: number): UrgencyLevel {
  if (remainingDays <= 3) return "SANGAT URGENT";
  if (remainingDays <= 7) return "URGENT";
  if (remainingDays <= 30) return "PERLU TINDAKAN";
  return "AMAN";
}
