"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export interface UserWithRole {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: string;
  unit: string | null;
  platform: string;
  is_active: boolean;
  created_at: string;
}

export interface SaveUserInput {
  email: string;
  password: string;
  name: string;
  role: string;
  unit: string;
  platform: string;
}

export interface UpdateUserInput {
  id: string;
  name: string;
  role: string;
  unit: string;
  platform: string;
  is_active: boolean;
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

export function useUsers(ulp?: string) {
  const [data, setData] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = ulp ? `?ulp=${ulp}` : "";
    const res = await authFetch(`/api/users${params}`);
    const json = await res.json();
    if (!res.ok) { setError(json.error); setLoading(false); return; }
    setData(json);
    setLoading(false);
  }, [ulp]);

  useEffect(() => { refresh(); }, [refresh]);

  const inviteUser = async (input: SaveUserInput): Promise<string | null> => {
    const res = await authFetch("/api/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok) return json.error;
    await refresh();
    return null;
  };

  const updateUser = async (input: UpdateUserInput): Promise<string | null> => {
    const res = await authFetch("/api/users", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok) return json.error;
    setData((prev) => prev.map((u) => u.id === input.id ? { ...u, ...input } : u));
    return null;
  };

  const deleteUser = async (id: string, user_id: string): Promise<string | null> => {
    const res = await authFetch("/api/users", {
      method: "DELETE",
      body: JSON.stringify({ id, user_id }),
    });
    const json = await res.json();
    if (!res.ok) return json.error;
    setData((prev) => prev.filter((u) => u.id !== id));
    return null;
  };

  return { data, loading, error, refresh, inviteUser, updateUser, deleteUser };
}
