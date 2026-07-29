import type { LucideIcon } from "lucide-react";

export default function SectionLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide mb-2.5">
      <Icon size={13} className="text-[#00897B]" />
      {children}
    </p>
  );
}
