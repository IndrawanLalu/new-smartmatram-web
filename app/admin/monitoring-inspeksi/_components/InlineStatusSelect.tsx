"use client";

import { useState } from "react";
import { STATUS_CONFIG, type InspeksiStatus, canUpdateStatus } from "@/lib/roles";
import { useCurrentUser } from "@/app/admin/_context/UserContext";

const STATUS_ORDER: InspeksiStatus[] = [
  "Temuan",
  "Perlu Tindakan",
  "Ditugaskan",
];

interface InlineStatusSelectProps {
  id: string;
  currentStatus: string;
  onUpdate: (id: string, status: InspeksiStatus) => Promise<void>;
}

export default function InlineStatusSelect({
  id,
  currentStatus,
  onUpdate,
}: InlineStatusSelectProps) {
  const user = useCurrentUser();
  const [saving, setSaving] = useState(false);

  const cfg = STATUS_CONFIG[currentStatus as InspeksiStatus];

  // Status "Dalam Proses" dan "Selesai" hanya bisa diubah via modal
  const isAdvancedStatus = currentStatus === "Dalam Proses" || currentStatus === "Selesai";

  if (!canUpdateStatus(user.role) || isAdvancedStatus) {
    return (
      <span
        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg?.bgColor ?? "bg-gray-100"} ${cfg?.color ?? "text-gray-600"}`}
      >
        {cfg?.label ?? currentStatus}
      </span>
    );
  }

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as InspeksiStatus;
    if (newStatus === currentStatus) return;
    setSaving(true);
    await onUpdate(id, newStatus);
    setSaving(false);
  };

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      disabled={saving}
      className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00897B]/30 disabled:opacity-60 ${cfg?.bgColor ?? "bg-gray-100"} ${cfg?.color ?? "text-gray-600"}`}
    >
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {STATUS_CONFIG[s].label}
        </option>
      ))}
    </select>
  );
}
