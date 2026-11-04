"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { CurrentUser } from "@/lib/roles";

export interface FeederRiskDriver {
  faktor: string;
  kontribusi: number;
}

export interface FeederRiskBreakdown {
  fitur: Record<string, number | boolean | null>;
  drivers: FeederRiskDriver[];
  catatan: string | null;
}

export interface FeederRisk {
  id: string;
  tgl: string;
  ulp: string;
  penyulang: string;
  risk_score: number;
  risk_level: "kritis" | "waspada" | "aman";
  predicted_cause: string | null;
  cause_confidence: number | null;
  breakdown: FeederRiskBreakdown;
  model_version: string;
}

export function useFeederRisk(user: CurrentUser | null) {
  const [riskData, setRiskData] = useState<FeederRisk[]>([]);
  const [dateTgl, setDateTgl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRisk() {
      // Ambil tgl terbaru yang tersedia (pipeline simpan H+1 = besok)
      const { data: latest } = await supabaseBrowser
        .from("daily_feeder_risk")
        .select("tgl")
        .order("tgl", { ascending: false })
        .limit(1)
        .single();

      if (!latest?.tgl) {
        setLoading(false);
        return;
      }

      setDateTgl(latest.tgl);

      let q = supabaseBrowser
        .from("daily_feeder_risk")
        .select("id, tgl, ulp, penyulang, risk_score, risk_level, predicted_cause, cause_confidence, breakdown, model_version")
        .eq("tgl", latest.tgl)
        .order("risk_score", { ascending: false });
      if (user?.unit) q = q.eq("ulp", user.unit);
      const { data } = await q;
      setRiskData((data ?? []) as FeederRisk[]);
      setLoading(false);
    }
    fetchRisk();
  }, [user]);

  const criticalCount = riskData.filter((r) => r.risk_level === "kritis").length;
  const waspCount = riskData.filter((r) => r.risk_level === "waspada").length;

  return { riskData, dateTgl, loading, criticalCount, waspCount };
}
