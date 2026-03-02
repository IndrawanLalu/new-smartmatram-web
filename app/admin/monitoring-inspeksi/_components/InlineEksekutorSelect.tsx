"use client";

import { useState } from "react";
import { canAssignEksekutor } from "@/lib/roles";
import { useCurrentUser } from "@/app/admin/_context/UserContext";

const EKSEKUTOR_OPTIONS = ["HARJAR", "HARGAR", "YANGU", "PDKB"] as const;

interface Props {
  id: string;
  currentEksekutor: string | null;
  onUpdate: (id: string, eksekutor: string | null) => Promise<void>;
}

export default function InlineEksekutorSelect({ id, currentEksekutor, onUpdate }: Props) {
  const user = useCurrentUser();
  const [saving, setSaving] = useState(false);

  if (!canAssignEksekutor(user.role)) {
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${currentEksekutor ? "bg-blue-50 text-blue-700" : "text-[#5D6D7E]"}`}>
        {currentEksekutor ?? "—"}
      </span>
    );
  }

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value || null;
    if (val === currentEksekutor) return;
    setSaving(true);
    await onUpdate(id, val);
    setSaving(false);
  };

  return (
    <select
      value={currentEksekutor ?? ""}
      onChange={handleChange}
      disabled={saving}
      className="text-xs px-2 py-1 rounded-lg border border-[#E2E8F0] text-[#1B2631] focus:outline-none focus:border-[#00897B] focus:ring-1 focus:ring-[#00897B]/20 bg-white cursor-pointer disabled:opacity-60 min-w-28"
    >
      <option value="">— Belum ditugaskan</option>
      {EKSEKUTOR_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}
