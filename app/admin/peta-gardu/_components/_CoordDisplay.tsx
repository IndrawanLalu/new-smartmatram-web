"use client";

import type { RefObject } from "react";

interface Props {
  coordRef: RefObject<HTMLDivElement | null>;
}

export default function CoordDisplay({ coordRef }: Props) {
  return (
    <div className="absolute bottom-8 right-3 z-[400] pointer-events-none">
      <div
        ref={coordRef}
        className="font-mono text-[10px] text-gray-500 bg-[#0d1b2a]/70 px-2 py-0.5 rounded backdrop-blur-sm"
      >
        —
      </div>
    </div>
  );
}
