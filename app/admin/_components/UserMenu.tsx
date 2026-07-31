"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Lock, LogOut, User } from "lucide-react";
import { logout } from "@/app/login/actions";
import ChangePasswordModal from "./ChangePasswordModal";

interface UserMenuProps {
  userEmail: string;
  userName: string;
  userRole: string;
  userUnit: string | null;
}

const MENU_ITEM =
  "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors";

export default function UserMenu({
  userEmail,
  userName,
  userRole,
  userUnit,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /** Tanpa ini dropdown terasa menempel: sekali terbuka hanya bisa ditutup
   *  lewat tombolnya sendiri. Klik di luar & Escape adalah yang dicoba orang. */
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const initials = userName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors ${
          open ? "bg-white" : "hover:bg-white"
        }`}
      >
        <span className="w-8 h-8 shrink-0 rounded-full bg-navy-600 grid place-items-center text-[11px] font-bold text-white">
          {initials || <User size={15} />}
        </span>
        <span className="hidden sm:block min-w-0 text-left">
          <span className="block max-w-[150px] truncate text-[13px] font-semibold leading-tight text-ink">
            {userName}
          </span>
          <span className="block truncate text-[11px] leading-tight text-ink-soft">
            {userRole}
            {userUnit ? ` · ${userUnit}` : ""}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-ink-muted transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-60 rounded-xl border border-line bg-white p-1.5 shadow-card-hover animate-pop-in"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-[13px] font-semibold text-ink">{userName}</p>
            <p className="truncate text-[11px] text-ink-soft">{userEmail}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="rounded-md bg-navy-50 px-1.5 py-0.5 text-[10px] font-bold text-navy-600">
                {userRole}
              </span>
              {userUnit && <span className="text-[10px] text-ink-muted">{userUnit}</span>}
            </div>
          </div>

          <div className="my-1 border-t border-line" />

          <button
            onClick={() => {
              setOpen(false);
              setChangePwOpen(true);
            }}
            className={`${MENU_ITEM} text-ink hover:bg-navy-50 hover:text-navy-600`}
          >
            <Lock size={15} className="shrink-0" />
            <span>Ganti Password</span>
          </button>

          <form action={logout}>
            <button
              type="submit"
              className={`${MENU_ITEM} text-ink-soft hover:bg-red-50 hover:text-red-600`}
            >
              <LogOut size={15} className="shrink-0" />
              <span>Keluar</span>
            </button>
          </form>
        </div>
      )}

      {changePwOpen && <ChangePasswordModal onClose={() => setChangePwOpen(false)} />}
    </div>
  );
}
