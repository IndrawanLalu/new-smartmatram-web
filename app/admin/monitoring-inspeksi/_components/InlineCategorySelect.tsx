"use client";

import { useState } from "react";
import { CATEGORY_CONFIG, type InspeksiCategory } from "@/lib/roles";

const CATEGORY_OPTIONS = Object.keys(CATEGORY_CONFIG) as InspeksiCategory[];

interface Props {
  id: string;
  currentCategory: string | null;
  onUpdate: (id: string, category: string | null) => Promise<void>;
}

export default function InlineCategorySelect({ id, currentCategory, onUpdate }: Props) {
  const [saving, setSaving] = useState(false);

  const cfg = CATEGORY_CONFIG[currentCategory as InspeksiCategory];

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value || null;
    if (val === currentCategory) return;
    setSaving(true);
    await onUpdate(id, val);
    setSaving(false);
  };

  return (
    <select
      value={currentCategory ?? ""}
      onChange={handleChange}
      disabled={saving}
      className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00897B]/30 disabled:opacity-60 ${
        cfg ? `${cfg.bgColor} ${cfg.color}` : "bg-[#1e3552] text-[#94a3b8]"
      }`}
    >
      <option value="">— Kategori —</option>
      {CATEGORY_OPTIONS.map((c) => (
        <option key={c} value={c}>
          {CATEGORY_CONFIG[c].label}
        </option>
      ))}
    </select>
  );
}
