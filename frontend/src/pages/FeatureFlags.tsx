import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError, apiGet, apiPatch } from "@/lib/api";
import { EmptyState, PanelCard } from "@/components/common/MetricCard";
import type { FeatureFlag } from "@/lib/types";
import { titleize } from "@/lib/types";

const SCOPES: { scope: FeatureFlag["scope"]; title: string; blurb: string }[] = [
  {
    scope: "category",
    title: "Service categories",
    blurb: "Architecture supports all eight; only switch a category live once supply and support are stable.",
  },
  { scope: "zone", title: "Zone rules", blurb: "Geofence-level operational controls inside Kolkata." },
  { scope: "city", title: "City operations", blurb: "City-level kill switches for phased expansion." },
];

export default function FeatureFlags() {
  const qc = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => apiGet<FeatureFlag[]>("/feature-flags"),
  });

  const toggle = useMutation({
    mutationFn: (v: { key: string; enabled: boolean }) =>
      apiPatch<FeatureFlag>(`/feature-flags/${v.key}`, { enabled: v.enabled }),
    onSuccess: (f) => {
      toast.success(`${f.label} ${f.enabled ? "enabled" : "disabled"}`);
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? "Could not toggle flag" : "Could not reach the API"),
  });

  const flags = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="wl-overline">Rollout control</p>
        <h1 className="mt-1.5 text-[30px] font-bold tracking-tight text-white">Feature Flags</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#8E95A5]">
          Category, zone and city activation is gated here — every toggle writes an audit entry.
        </p>
      </div>

      {isError || flags.length === 0 ? (
        <PanelCard title="Flags" testId="flags-panel">
          <EmptyState message="Feature flags load once the config API is reachable." testId="flags-empty" />
        </PanelCard>
      ) : (
        SCOPES.map(({ scope, title, blurb }) => {
          const group = flags.filter((f) => f.scope === scope);
          if (group.length === 0) return null;
          return (
            <PanelCard
              key={scope}
              title={title}
              testId={`flags-panel-${scope}`}
              action={<span className="text-[11px] text-[#7E8698]">{blurb}</span>}
            >
              <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((f) => (
                  <div
                    key={f.id}
                    data-testid={`flag-card-${f.key}`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-[#2A303F] bg-[#161A22] p-4"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-white">{f.label}</p>
                      <p className="wl-mono mt-1 text-[10px] text-[#7E8698]">{f.key}</p>
                      {f.note ? <p className="mt-1.5 text-[11px] text-[#8E95A5]">{f.note}</p> : null}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={f.enabled}
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ key: f.key, enabled: !f.enabled })}
                      data-testid={`flag-toggle-${f.key}`}
                      className="relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-150 disabled:opacity-50"
                      style={{
                        backgroundColor: f.enabled ? "#2A2312" : "#1D2330",
                        borderColor: f.enabled ? "#634E1D" : "#2A303F",
                      }}
                    >
                      <span
                        className="absolute top-0.5 h-4.5 w-4.5 rounded-full transition-[left] duration-150"
                        style={{
                          left: f.enabled ? "1.5rem" : "0.15rem",
                          width: "1.1rem",
                          height: "1.1rem",
                          backgroundColor: f.enabled ? "#D4AF37" : "#6B7280",
                        }}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </PanelCard>
          );
        })
      )}

      <p className="text-xs text-[#7E8698]">
        Currently live categories:{" "}
        <span className="text-[#F5D061]">
          {flags
            .filter((f) => f.scope === "category" && f.enabled)
            .map((f) => titleize(f.key.replace("category.", "")))
            .join(", ") || "none"}
        </span>
      </p>
    </div>
  );
}
