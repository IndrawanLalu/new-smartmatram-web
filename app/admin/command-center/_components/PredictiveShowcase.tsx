"use client";

import RiskGaugeHero from "./RiskGaugeHero";
import CauseDonut from "./CauseDonut";
import CauseHeatmap from "./CauseHeatmap";
import type { FeederRisk } from "../_hooks/useFeederRisk";
import type { CurrentUser } from "@/lib/roles";

interface TrendPoint {
  label: string;
  count: number;
}

interface Props {
  user: CurrentUser | null;
  riskData: FeederRisk[];
  dateTgl: string | null;
  loadingRisk: boolean;
  trend: TrendPoint[];
}

export default function PredictiveShowcase({ user, riskData, dateTgl, loadingRisk, trend }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <RiskGaugeHero riskData={riskData} dateTgl={dateTgl} trend={trend} loading={loadingRisk} />
        <CauseDonut user={user} />
      </div>

      <CauseHeatmap user={user} />
    </div>
  );
}
