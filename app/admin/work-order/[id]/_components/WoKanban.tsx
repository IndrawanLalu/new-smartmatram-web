"use client";

import { useMemo, useState } from "react";
import { Camera, MapPin, Ruler, ShieldCheck, User } from "lucide-react";
import { parseLocaleNumber } from "@/lib/parseLocaleNumber";
import { woStage, type WoBatch, type WoItem, type WoStage } from "../../_types";
import { STAGE_CONFIG, STAGE_ORDER, STAGE_RAMP, formatNumberId, fmtDate } from "../../_constants";
import { CARD_LIFT, DISPLAY } from "@/app/admin/_ui";

const PAGE_STEP = 25;

interface WoKanbanProps {
  batch: WoBatch;
  /** Baris yang sudah lewat filter toolbar — Kanban ikut filter yang sama. */
  items: WoItem[];
  onOpen: (id: string) => void;
}

/**
 * Papan Kanban per tahap persetujuan — tampilan triase.
 * Kartu dibuka ke drawer untuk bertindak; tahap tidak dipindah dengan
 * drag-and-drop karena setiap perpindahan butuh wewenang & input
 * (SLA, catatan) yang tidak bisa diwakili gerakan tarik.
 */
export default function WoKanban({ batch, items, onOpen }: WoKanbanProps) {
  const columns = useMemo(() => {
    const map: Record<WoStage, WoItem[]> = {
      Belum: [], Dikerjakan: [], Diverifikasi: [], Disetujui: [],
    };
    for (const it of items) map[woStage(it)].push(it);
    return map;
  }, [items]);

  const [shown, setShown] = useState<Record<string, number>>({});

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {STAGE_ORDER.map((stage, i) => {
        const list = columns[stage];
        const limit = shown[stage] ?? PAGE_STEP;
        const cfg = STAGE_CONFIG[stage];

        return (
          <section
            key={stage}
            className="min-w-[17.5rem] flex-1 rounded-2xl bg-navy-50/50 p-2.5"
            aria-label={`Tahap ${cfg.label}, ${list.length} baris`}
          >
            <header className="flex items-center gap-2 px-1.5 pb-2.5">
              <span className="h-4 w-1 rounded-full" style={{ backgroundColor: STAGE_RAMP[i] }} />
              <h3 className="text-[13px] font-semibold text-ink">{cfg.label}</h3>
              <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink-soft border border-line">
                {list.length}
              </span>
            </header>

            <div className="space-y-2 max-h-[calc(100vh-var(--topbar-h)-26rem)] min-h-[6rem] overflow-y-auto pr-0.5">
              {list.slice(0, limit).map((item) => (
                <KanbanCard key={item.id} item={item} batch={batch} onOpen={onOpen} />
              ))}

              {list.length === 0 && (
                <p className="px-1.5 py-6 text-center text-xs text-ink-muted">Tidak ada baris.</p>
              )}

              {list.length > limit && (
                <button
                  onClick={() => setShown((p) => ({ ...p, [stage]: limit + PAGE_STEP }))}
                  className="w-full rounded-xl border border-dashed border-navy-200 py-2 text-xs font-medium text-navy-600 hover:bg-white transition-colors"
                >
                  Tampilkan {Math.min(PAGE_STEP, list.length - limit)} lagi
                  <span className="text-ink-muted"> · sisa {list.length - limit}</span>
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function KanbanCard({
  item,
  batch,
  onOpen,
}: {
  item: WoItem;
  batch: WoBatch;
  onOpen: (id: string) => void;
}) {
  const visibleCols = batch.columns.filter((c) => !c.hidden);
  const title =
    (batch.title_column && item.data[batch.title_column]) ||
    visibleCols.map((c) => item.data[c.key]).find((v) => v?.trim()) ||
    `Baris ${item.urutan + 1}`;

  // Baris kedua: kolom pertama yang bukan judul, sebagai konteks (mis. penyulang).
  const subtitle = visibleCols
    .filter((c) => c.key !== batch.title_column && c.key !== batch.measure_column)
    .map((c) => item.data[c.key])
    .find((v) => v?.trim() && v !== title);

  const measure = batch.measure_column
    ? parseLocaleNumber(item.data[batch.measure_column])
    : null;

  return (
    <button
      onClick={() => onOpen(item.id)}
      className={`${CARD_LIFT} w-full p-3 text-left`}
    >
      <p className={`${DISPLAY} text-[13px] font-semibold leading-snug text-ink line-clamp-2`}>
        {title}
      </p>
      {subtitle && <p className="mt-0.5 text-[11px] text-ink-muted truncate">{subtitle}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {item.regu && (
          <span className="rounded-md bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold text-navy-600">
            {item.regu}
          </span>
        )}
        {measure != null && measure > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-attention-tint px-1.5 py-0.5 text-[10px] font-semibold text-attention">
            <Ruler size={9} /> {formatNumberId(measure)} {batch.measure_unit || "kms"}
          </span>
        )}
        {item.verifier_role && !item.verified_at && (
          <span className="inline-flex items-center gap-1 rounded-md bg-accent-tint px-1.5 py-0.5 text-[10px] font-semibold text-accent-deep">
            <ShieldCheck size={9} /> {item.verifier_role}
          </span>
        )}
        {item.sla_ok === false && (
          <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
            Tidak SLA
          </span>
        )}
      </div>

      {(item.selesai_by || item.tgl_realisasi || item.foto_bukti_url) && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2 text-[10px] text-ink-muted">
          {item.selesai_by && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Avatar name={item.selesai_by} />
              <span className="truncate">{item.selesai_by}</span>
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 shrink-0">
            {item.foto_bukti_url && <Camera size={11} className="text-accent" />}
            {item.selesai_lat != null && <MapPin size={11} className="text-navy-400" />}
            {item.tgl_realisasi && <span className="tabular-nums">{fmtDate(item.tgl_realisasi)}</span>}
          </span>
        </div>
      )}
    </button>
  );
}

/** Avatar inisial — menggantikan foto yang tidak kita punya. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-navy-100 text-[8px] font-bold text-navy-600">
      {initials || <User size={8} />}
    </span>
  );
}
