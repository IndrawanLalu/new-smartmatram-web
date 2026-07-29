"use client";

import { useState } from "react";
import { X, Lock } from "lucide-react";
import { MOBILE_MENUS, type RoleRow } from "@/lib/roles";
import type { RoleInput } from "@/app/admin/_hooks/useRoles";

const PLATFORMS = [
  { value: "all", label: "Web & Mobile" },
  { value: "web", label: "Web saja" },
  { value: "mobile", label: "Mobile saja" },
];

type Props =
  | { mode: "create"; onClose: () => void; onSave: (i: RoleInput) => Promise<string | null> }
  | { mode: "edit"; role: RoleRow; onClose: () => void; onSave: (i: RoleInput) => Promise<string | null> };

export default function RoleFormModal(props: Props) {
  const isEdit = props.mode === "edit";
  const r = isEdit ? props.role : null;
  const locked = !!r?.is_system; // role sistem: kode & flag terkunci

  const [code, setCode] = useState(r?.code ?? "");
  const [label, setLabel] = useState(r?.label ?? "");
  const [platform, setPlatform] = useState<string>(r?.platform ?? "mobile");
  const [needsUnit, setNeedsUnit] = useState(r?.needs_unit ?? true);
  const [isEksekutor, setIsEksekutor] = useState(r?.is_eksekutor ?? true);
  const [seesAll, setSeesAll] = useState(r?.sees_all_units ?? false);
  const [canAssign, setCanAssign] = useState(r?.can_assign ?? false);
  const [verifyWo, setVerifyWo] = useState(r?.can_verify_wo ?? false);
  const [approveWo, setApproveWo] = useState(r?.can_approve_wo ?? false);
  const [menus, setMenus] = useState<string[]>(r?.menus ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMenu = (id: string) =>
    setMenus((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  async function handleSubmit() {
    if (!label.trim()) return setError("Label wajib diisi");
    if (!isEdit && !/^[A-Za-z0-9_]{2,30}$/.test(code)) {
      return setError("Kode: 2-30 karakter, huruf/angka/underscore");
    }
    setSaving(true);
    setError(null);
    const err = await props.onSave({
      code: code.toUpperCase(),
      label: label.trim(),
      platform,
      needs_unit: needsUnit,
      is_eksekutor: isEksekutor,
      sees_all_units: seesAll,
      can_assign: canAssign,
      can_verify_wo: verifyWo,
      can_approve_wo: approveWo,
      menus,
    });
    setSaving(false);
    if (err) return setError(err);
    props.onClose();
  }

  const FLAGS: { state: boolean; set: (v: boolean) => void; title: string; desc: string }[] = [
    { state: isEksekutor, set: setIsEksekutor, title: "Regu WO (eksekutor)", desc: "Muncul sebagai opsi regu di Work Order + dasar filter WO di mobile" },
    { state: needsUnit, set: setNeedsUnit, title: "Wajib punya ULP", desc: "Akun role ini harus diikat ke satu ULP" },
    { state: seesAll, set: setSeesAll, title: "Lihat semua ULP", desc: "Akses lintas unit (seperti UP3)" },
    { state: canAssign, set: setCanAssign, title: "Boleh kelola/assign", desc: "Bisa menugaskan eksekutor & kelola data" },
    { state: verifyWo, set: setVerifyWo, title: "Verifikator WO", desc: "Boleh memverifikasi WO selesai + nilai SLA (Koordinator/Staff Teknik)" },
    { state: approveWo, set: setApproveWo, title: "Approver WO", desc: "Boleh menyetujui akhir WO yang sudah diverifikasi (Supervisor)" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#E0F2F1] rounded-t-2xl">
          <h2 className="font-bold text-[#004D40]">{isEdit ? "Edit Role" : "Tambah Role Baru"}</h2>
          <button onClick={props.onClose} className="text-[#5D6D7E] hover:text-[#1B2631]"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {locked && (
            <p className="flex items-center gap-2 text-xs text-[#5D6D7E] bg-[#F4F6F8] rounded-lg px-3 py-2">
              <Lock size={13} /> Role sistem — hanya label & platform yang bisa diubah.
            </p>
          )}

          <div>
            <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">Kode Role</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={isEdit}
              placeholder="mis. HARJAR_2"
              className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] uppercase placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 disabled:bg-gray-50 disabled:text-[#9CA3AF]"
            />
            <p className="text-[10px] text-[#5D6D7E] mt-1">Dipakai di DB & mobile — tak bisa diubah setelah dibuat.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nama tampilan role"
              className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            >
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">Sifat Role</label>
            {FLAGS.map((f) => (
              <label
                key={f.title}
                className={`flex items-start gap-3 rounded-lg border border-[#E2E8F0] px-3 py-2 ${locked ? "opacity-60" : "cursor-pointer hover:border-[#00897B]/40"}`}
              >
                <input
                  type="checkbox"
                  checked={f.state}
                  disabled={locked}
                  onChange={(e) => f.set(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#00897B]"
                />
                <span>
                  <span className="block text-sm text-[#1B2631]">{f.title}</span>
                  <span className="block text-[11px] text-[#5D6D7E]">{f.desc}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">Akses Menu Mobile</label>
            <p className="text-[11px] text-[#5D6D7E]">
              Menu yang bisa dilihat role ini di HP. (Work Order otomatis muncul bila &quot;Regu WO&quot; dicentang.)
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {MOBILE_MENUS.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 cursor-pointer hover:border-[#00897B]/40"
                >
                  <input
                    type="checkbox"
                    checked={menus.includes(m.id)}
                    onChange={() => toggleMenu(m.id)}
                    className="w-4 h-4 accent-[#00897B]"
                  />
                  <span className="text-sm text-[#1B2631]">{m.label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button onClick={props.onClose} className="px-4 py-2 text-sm text-[#5D6D7E] hover:text-[#1B2631] border border-[#E2E8F0] rounded-lg">Batal</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : isEdit ? "Simpan" : "Tambah Role"}
          </button>
        </div>
      </div>
    </div>
  );
}
