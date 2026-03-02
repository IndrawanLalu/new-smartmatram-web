"use client";

import { useState } from "react";
import { canAssignEksekutor } from "@/lib/roles";
import { useCurrentUser } from "@/app/admin/_context/UserContext";

const TEAM_OPTIONS = ["RABAS 1", "RABAS 2", "RABAS 3", "PDKB"] as const;

interface Props {
  id: string;
  currentTeam: string | null;
  onUpdate: (id: string, team: string | null) => Promise<void>;
}

export default function InlineTeamSelect({ id, currentTeam, onUpdate }: Props) {
  const user = useCurrentUser();
  const [saving, setSaving] = useState(false);

  if (!canAssignEksekutor(user.role)) {
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${currentTeam ? "bg-purple-50 text-purple-700" : "text-[#5D6D7E]"}`}>
        {currentTeam ?? "—"}
      </span>
    );
  }

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value || null;
    if (val === currentTeam) return;
    setSaving(true);
    await onUpdate(id, val);
    setSaving(false);
  };

  return (
    <select
      value={currentTeam ?? ""}
      onChange={handleChange}
      disabled={saving}
      className="text-xs px-2 py-1 rounded-lg border border-[#E2E8F0] text-[#1B2631] focus:outline-none focus:border-[#00897B] focus:ring-1 focus:ring-[#00897B]/20 bg-white cursor-pointer disabled:opacity-60 min-w-28"
    >
      <option value="">— Belum ditugaskan</option>
      {TEAM_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}
