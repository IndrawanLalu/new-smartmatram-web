"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { DEFAULT_ROLE_ROWS, type RoleRow } from "@/lib/roles";

// Cache modul: dibagi antar komponen, di-bust saat mutasi.
let cache: RoleRow[] | null = null;

export interface RoleInput {
  code: string;
  label: string;
  platform: string;
  needs_unit: boolean;
  is_eksekutor: boolean;
  sees_all_units: boolean;
  can_assign: boolean;
  can_verify_wo: boolean;
  can_approve_wo: boolean;
  menus: string[];
  urutan?: number;
}

async function authFetch(url: string, options: RequestInit = {}) {
  const { data: { session } } = await supabaseBrowser.auth.getSession();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
      ...(options.headers ?? {}),
    },
  });
}

/**
 * Daftar role dari tabel `roles` (fallback ke DEFAULT_ROLE_ROWS bila tabel belum ada).
 * `eksekutorRoles` = kode role yang is_eksekutor (dipakai sbg opsi regu di WO).
 */
export function useRoles() {
  const [roles, setRoles] = useState<RoleRow[]>(cache ?? DEFAULT_ROLE_ROWS);
  const [loading, setLoading] = useState(!cache);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser
      .from("roles")
      .select("*")
      .order("urutan", { ascending: true });
    const rows = !error && data && data.length ? (data as RoleRow[]) : DEFAULT_ROLE_ROWS;
    cache = rows;
    setRoles(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (cache) { setRoles(cache); setLoading(false); }
    else void load();
  }, [load]);

  const refresh = useCallback(async () => {
    cache = null;
    setLoading(true);
    await load();
  }, [load]);

  const mutate = useCallback(
    async (method: "POST" | "PATCH" | "DELETE", body: unknown): Promise<string | null> => {
      const res = await authFetch("/api/roles", { method, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) return json.error ?? "Gagal menyimpan";
      await refresh();
      return null;
    },
    [refresh],
  );

  const createRole = useCallback((input: RoleInput) => mutate("POST", input), [mutate]);
  const updateRole = useCallback((input: RoleInput) => mutate("PATCH", input), [mutate]);
  const deleteRole = useCallback((code: string) => mutate("DELETE", { code }), [mutate]);

  /** Simpan perubahan menu untuk banyak role sekaligus (matriks), lalu refresh sekali. */
  const saveMenusBulk = useCallback(
    async (changes: { code: string; menus: string[] }[]): Promise<string | null> => {
      for (const c of changes) {
        const res = await authFetch("/api/roles", { method: "PATCH", body: JSON.stringify(c) });
        const json = await res.json();
        if (!res.ok) return json.error ?? "Gagal menyimpan";
      }
      await refresh();
      return null;
    },
    [refresh],
  );

  const eksekutorRoles = useMemo(
    () => roles.filter((r) => r.is_eksekutor).map((r) => r.code),
    [roles],
  );
  const verifierRoles = useMemo(
    () => roles.filter((r) => r.can_verify_wo).map((r) => r.code),
    [roles],
  );

  return { roles, eksekutorRoles, verifierRoles, loading, refresh, createRole, updateRole, deleteRole, saveMenusBulk };
}
