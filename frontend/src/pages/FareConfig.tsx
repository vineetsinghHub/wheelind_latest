import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError, apiGet, apiPut } from "@/lib/api";
import { EmptyState, PanelCard } from "@/components/common/MetricCard";
import type { FareConfig } from "@/lib/types";
import { titleize } from "@/lib/types";

const FIELDS: { key: keyof Draft; label: string; suffix: string }[] = [
  { key: "base_fare", label: "Base fare", suffix: "₹" },
  { key: "minimum_fare", label: "Minimum fare", suffix: "₹" },
  { key: "per_km", label: "Per km charge", suffix: "₹/km" },
  { key: "per_minute", label: "Per minute charge", suffix: "₹/min" },
  { key: "waiting_charge_per_min", label: "Waiting charge", suffix: "₹/min" },
  { key: "cancellation_charge", label: "Cancellation charge", suffix: "₹" },
  { key: "surge_cap", label: "Surge ceiling", suffix: "x" },
  { key: "night_charge_pct", label: "Night charge (11PM–5AM)", suffix: "%" },
  { key: "tax_pct", label: "GST", suffix: "%" },
];

interface Draft {
  base_fare: number;
  minimum_fare: number;
  per_km: number;
  per_minute: number;
  waiting_charge_per_min: number;
  cancellation_charge: number;
  surge_cap: number;
  night_charge_pct: number;
  tax_pct: number;
}

function toDraft(f: FareConfig): Draft {
  return {
    base_fare: f.base_fare,
    minimum_fare: f.minimum_fare,
    per_km: f.per_km,
    per_minute: f.per_minute,
    waiting_charge_per_min: f.waiting_charge_per_min,
    cancellation_charge: f.cancellation_charge,
    surge_cap: f.surge_cap,
    night_charge_pct: f.night_charge_pct,
    tax_pct: f.tax_pct,
  };
}

export default function FareConfigPage() {
  const qc = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ["fare-configs"],
    queryFn: () => apiGet<FareConfig[]>("/fare-configs"),
  });

  const [active, setActive] = useState<string>("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const configs = data ?? [];
  const current = configs.find((c) => c.category === active) ?? configs[0];

  useEffect(() => {
    if (current && (!draft || active !== current.category)) {
      setActive(current.category);
      setDraft(toDraft(current));
    }
  }, [current, active, draft]);

  const save = useMutation({
    mutationFn: (v: { category: string; body: Draft }) =>
      apiPut<FareConfig>(`/fare-configs/${v.category}`, v.body),
    onSuccess: (f) => {
      toast.success(`${titleize(f.category)} fare saved — version ${f.version}`);
      qc.invalidateQueries({ queryKey: ["fare-configs"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e) => {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === "object"
          ? String((e.body as { detail?: string }).detail ?? "Save failed")
          : "Save failed";
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="wl-overline">Pricing governance · Kolkata</p>
        <h1 className="mt-1.5 text-[30px] font-bold tracking-tight text-white">Fare Configuration</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#8E95A5]">
          Every change bumps the config version and writes an audit entry, so fare disputes stay
          resolvable.
        </p>
      </div>

      {isError || configs.length === 0 ? (
        <PanelCard title="Fare slabs" testId="fare-panel">
          <EmptyState message="Fare configuration loads once the pricing API is reachable." testId="fare-empty" />
        </PanelCard>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <PanelCard title="Service categories" className="lg:col-span-3" testId="fare-category-list">
            <div className="p-2">
              {configs.map((c) => (
                <button
                  key={c.category}
                  type="button"
                  onClick={() => {
                    setActive(c.category);
                    setDraft(toDraft(c));
                  }}
                  data-testid={`fare-category-${c.category}`}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors duration-150 ${
                    active === c.category
                      ? "bg-[#1C1F28] font-semibold text-[#F5D061]"
                      : "text-[#9BA1B0] hover:bg-[#161A22] hover:text-white"
                  }`}
                >
                  {titleize(c.category)}
                  <span className="wl-mono text-[10px] text-[#7E8698]">v{c.version}</span>
                </button>
              ))}
            </div>
          </PanelCard>

          <PanelCard
            title={current ? `${titleize(current.category)} fare breakup` : "Fare breakup"}
            className="lg:col-span-9"
            testId="fare-editor-panel"
            action={
              current ? (
                <span className="wl-mono text-[11px] text-[#7E8698]">
                  Version {current.version} · {current.city}
                </span>
              ) : null
            }
          >
            {draft && current ? (
              <form
                className="p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate({ category: current.category, body: draft });
                }}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">
                        {f.label} <span className="text-[#5E6575]">({f.suffix})</span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        required
                        value={draft[f.key]}
                        onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
                        data-testid={`fare-input-${f.key}`}
                        className="wl-mono w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={save.isPending}
                    data-testid="fare-save-button"
                    className="rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-semibold text-[#090A0C] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-60"
                  >
                    {save.isPending ? "Saving…" : "Save fare configuration"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft(toDraft(current))}
                    data-testid="fare-reset-button"
                    className="rounded-lg border border-[#2A303F] px-4 py-2.5 text-sm text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/50 hover:text-white"
                  >
                    Reset
                  </button>
                </div>

                <div className="mt-6 rounded-lg border border-[#2A303F] bg-[#161A22] p-4">
                  <p className="wl-overline">Sample 8 km / 20 min trip</p>
                  <p className="wl-mono mt-2 text-lg font-semibold text-white" data-testid="fare-preview-total">
                    ₹
                    {Math.max(
                      draft.minimum_fare,
                      draft.base_fare + draft.per_km * 8 + draft.per_minute * 20,
                    ).toFixed(2)}{" "}
                    <span className="text-xs font-normal text-[#8E95A5]">
                      + {draft.tax_pct}% GST, up to {draft.surge_cap}x surge
                    </span>
                  </p>
                </div>
              </form>
            ) : (
              <EmptyState message="Select a service category to edit its fare." />
            )}
          </PanelCard>
        </div>
      )}
    </div>
  );
}
