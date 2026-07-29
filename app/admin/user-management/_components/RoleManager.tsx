"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Lock, ShieldCheck, Globe, Smartphone, Layers } from "lucide-react";
import { useRoles } from "@/app/admin/_hooks/useRoles";
import type { RoleRow } from "@/lib/roles";
import RoleFormModal from "./RoleFormModal";

const PLATFORM: Record<string, { label: string; icon: typeof Globe; cls: string }> = {
  all: { label: "Web & Mobile", icon: Layers, cls: "bg-[#E0F2F1] text-[#00695C]" },
  web: { label: "Web", icon: Globe, cls: "bg-blue-50 text-blue-700" },
  mobile: { label: "Mobile", icon: Smartphone, cls: "bg-slate-100 text-slate-600" },
};

export default function RoleManager() {
  const { roles, loading, createRole, updateRole, deleteRole } = useRoles();
  const [addOpen, setAddOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleRow | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleDelete(role: RoleRow) {
    if (!confirm(`Hapus role "${role.label}" (${role.code})?`)) return;
    setErr(await deleteRole(role.code));
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#E0F2F1] flex items-center justify-center shrink-0">
            <ShieldCheck size={18} className="text-[#00897B]" />
          </div>
          <div>
            <p className="font-semibold text-[#1B2631] text-sm">Daftar Role &amp; Regu</p>
            <p className="text-xs text-[#5D6D7E]">
              Role bertanda <span className="font-medium text-amber-700">Regu WO</span> otomatis jadi opsi regu di Work Order.
            </p>
          </div>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={15} /> Tambah Role
        </button>
      </div>

      {err && <div className="px-5 py-2.5 text-sm text-red-600 bg-red-50 border-b border-[#E2E8F0]">{err}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-32 gap-2 text-[#5D6D7E]">
          <div className="w-5 h-5 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" /> Memuat role...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#E0F2F1] text-[#00695C] text-xs uppercase tracking-wide">
                <th className="px-5 py-2.5 text-left font-semibold">Role</th>
                <th className="px-4 py-2.5 text-left font-semibold">Platform</th>
                <th className="px-4 py-2.5 text-left font-semibold">Sifat</th>
                <th className="px-4 py-2.5 text-left font-semibold">Menu</th>
                <th className="px-4 py-2.5 text-center font-semibold w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F6]">
              {roles.map((r) => {
                const plat = PLATFORM[r.platform] ?? PLATFORM.mobile;
                const PlatIcon = plat.icon;
                const menuCount = r.menus?.length ?? 0;
                return (
                  <tr key={r.code} className="hover:bg-[#F8FAFB] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1B2631]">{r.label}</span>
                        {r.is_system && (
                          <span title="Role sistem" className="inline-flex items-center gap-0.5 text-[10px] text-[#94A3B8] bg-[#F1F5F9] px-1.5 py-0.5 rounded-full">
                            <Lock size={9} /> sistem
                          </span>
                        )}
                      </div>
                      <span className="block text-[11px] text-[#94A3B8] font-mono mt-0.5">{r.code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${plat.cls}`}>
                        <PlatIcon size={11} /> {plat.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.is_eksekutor && <Pill cls="bg-amber-100 text-amber-700">Regu WO</Pill>}
                        {r.can_verify_wo && <Pill cls="bg-cyan-50 text-cyan-700">Verifikator</Pill>}
                        {r.can_approve_wo && <Pill cls="bg-emerald-50 text-emerald-700">Approver</Pill>}
                        {r.sees_all_units && <Pill cls="bg-blue-50 text-blue-700">Semua ULP</Pill>}
                        {r.can_assign && <Pill cls="bg-purple-50 text-purple-700">Kelola</Pill>}
                        {!r.is_eksekutor && !r.sees_all_units && !r.can_assign && !r.can_verify_wo && !r.can_approve_wo && (
                          <span className="text-xs text-[#CBD5E1]">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-[#5D6D7E]">
                        {r.platform === "web" ? "—" : `${menuCount} menu`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setEditRole(r)}
                          title="Edit"
                          className="p-1.5 text-[#5D6D7E] hover:text-[#00897B] hover:bg-[#E0F2F1] rounded-lg transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(r)}
                          disabled={r.is_system}
                          title={r.is_system ? "Role sistem tak bisa dihapus" : "Hapus"}
                          className="p-1.5 text-[#5D6D7E] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-[#5D6D7E] disabled:cursor-not-allowed"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && <RoleFormModal mode="create" onClose={() => setAddOpen(false)} onSave={createRole} />}
      {editRole && <RoleFormModal mode="edit" role={editRole} onClose={() => setEditRole(null)} onSave={updateRole} />}
    </div>
  );
}

function Pill({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>;
}
