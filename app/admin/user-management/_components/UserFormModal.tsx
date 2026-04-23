"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { UNITS } from "@/lib/roles";
import type { UserWithRole, SaveUserInput, UpdateUserInput } from "../_hooks/useUsers";

const ROLES = [
  { value: "UP3",       label: "UP3",        platform: "web" },
  { value: "admin",     label: "Admin ULP",  platform: "all" },
  { value: "inspektor", label: "Inspektor",  platform: "mobile" },
  { value: "PERABASAN", label: "Perabasan",  platform: "mobile" },
  { value: "YANGU",     label: "YANGU",      platform: "mobile" },
  { value: "HARJAR",    label: "HARJAR",     platform: "mobile" },
  { value: "HARGAR",    label: "HARGAR",     platform: "mobile" },
  { value: "PDKB",      label: "PDKB",       platform: "mobile" },
  { value: "manager",   label: "Manager",    platform: "web" },
  { value: "K3",        label: "Tim K3",     platform: "all" },
];

const PLATFORMS = [
  { value: "all",    label: "Web & Mobile" },
  { value: "web",    label: "Web saja" },
  { value: "mobile", label: "Mobile saja" },
];

type Props =
  | { mode: "invite"; onClose: () => void; onSave: (input: SaveUserInput) => Promise<string | null>; fixedUnit?: string }
  | { mode: "edit"; user: UserWithRole; onClose: () => void; onSave: (input: UpdateUserInput) => Promise<string | null> };

export default function UserFormModal(props: Props) {
  const isEdit = props.mode === "edit";

  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [name, setName]           = useState(isEdit ? props.user.name : "");
  const [role, setRole]         = useState(isEdit ? props.user.role : "inspektor");
  const [unit, setUnit]         = useState(isEdit ? (props.user.unit ?? "") : (props.mode === "invite" && props.fixedUnit ? props.fixedUnit : "AMPENAN"));
  const [platform, setPlatform] = useState(isEdit ? props.user.platform : "mobile");
  const [isActive, setIsActive] = useState(isEdit ? props.user.is_active : true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const selectedRole = ROLES.find((r) => r.value === role);

  const handleRoleChange = (val: string) => {
    setRole(val);
    const r = ROLES.find((r) => r.value === val);
    if (r) setPlatform(r.platform);
    if (val === "UP3") setUnit("");
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Nama wajib diisi"); return; }
    if (!isEdit && !email.trim()) { setError("Email wajib diisi"); return; }
    if (!isEdit && password.length < 6) { setError("Password minimal 6 karakter"); return; }
    if (!isEdit && password !== confirm) { setError("Konfirmasi password tidak cocok"); return; }
    if (role !== "UP3" && !unit) { setError("ULP wajib dipilih"); return; }

    setSaving(true);
    setError(null);

    let err: string | null;
    if (isEdit) {
      err = await props.onSave({ id: props.user.id, name, role, unit, platform, is_active: isActive });
    } else {
      err = await props.onSave({ email, password, name, role, unit, platform });
    }

    setSaving(false);
    if (err) { setError(err); return; }
    props.onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#E0F2F1] rounded-t-2xl">
          <h2 className="font-bold text-[#004D40]">
            {isEdit ? "Edit User" : "Invite User Baru"}
          </h2>
          <button onClick={props.onClose} className="text-[#5D6D7E] hover:text-[#1B2631]">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Email + Password — hanya saat tambah user baru */}
          {!isEdit && (
            <>
              <div>
                <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@pln.co.id"
                  className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">Konfirmasi Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Ulangi password"
                  className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                />
              </div>
            </>
          )}

          {/* Nama */}
          <div>
            <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">Nama</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama lengkap atau nama akun"
              className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            />
          </div>

          {/* Role */}
          <div>
            <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">Role</label>
            <select
              value={role}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* ULP */}
          {role !== "UP3" && (
            <div>
              <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">ULP</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                disabled={props.mode === "invite" && !!props.fixedUnit}
                className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 disabled:bg-gray-50 disabled:text-[#9CA3AF]"
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Platform */}
          <div>
            <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {selectedRole && (
              <p className="text-[10px] text-[#5D6D7E] mt-1">
                Rekomendasi untuk {selectedRole.label}: {selectedRole.platform === "all" ? "Web & Mobile" : selectedRole.platform === "mobile" ? "Mobile saja" : "Web saja"}
              </p>
            )}
          </div>

          {/* Status aktif — hanya saat edit */}
          {isEdit && (
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-[#00897B]"
              />
              <label htmlFor="is_active" className="text-sm text-[#1B2631]">Akun aktif</label>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button
            onClick={props.onClose}
            className="px-4 py-2 text-sm text-[#5D6D7E] hover:text-[#1B2631] border border-[#E2E8F0] rounded-lg"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Buat Akun"}
          </button>
        </div>
      </div>
    </div>
  );
}
