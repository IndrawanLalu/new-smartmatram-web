"use client";

import { createContext, useContext } from "react";
import { type CurrentUser } from "@/lib/roles";

const UserContext = createContext<CurrentUser | null>(null);

export function UserProvider({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/**
 * Akses data user (role, unit, name) di Client Components.
 *
 * @example
 * const user = useCurrentUser();
 * if (user.role === 'UP3') { ... }
 */
export function useCurrentUser(): CurrentUser {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useCurrentUser harus dipakai di dalam AdminLayout");
  return ctx;
}
