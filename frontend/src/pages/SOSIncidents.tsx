import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError, apiGet, apiPatch } from "@/lib/api";
import { EmptyState, MetricCard, PanelCard } from "@/components/common/MetricCard";
import { ToneBadge } from "@/components/common/StatusBadge";
import type { SosIncident } from "@/lib/types";
import { fmtDateTime, titleize } from "@/lib/types";

export default function SOSIncidents() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<SosIncident | null>(null);

  const { data, isError } = useQuery({
    queryKey: ["sos", status],
    queryFn: () => apiGet<SosIncident[]>(`/sos${status ? `?status=${status}` : ""}`),
    refetchInterval: 30000,
  });

  const act = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      apiPatch<SosIncident>(`/sos/${v.id}`, { status: v.status, note: "Handled from safety console" }),
    onSuccess: (s) => {
      toast.success(`${s.ride_code} marked ${titleize(s.status)}`);
      setSelected(s);
      qc.invalidateQueries({ queryKey: ["sos"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError && e.body && typeof e.body === "object"
          ? String((e.body as { detail?: string }).detail ?? "Action failed")
          : "Action failed",
      ),
  });

  const list = data ?? [];
  const openCount = list.filter((s) => s.status === "open").length;
  const critical = list.filter((s) => s.severity === "critical" && s.status !== "resolved").length;

  return (
    <div className="space-y-6">
      <div>
        <p className="wl-overline">Safety & emergency response</p>
        <h1 className="mt-1.5 text-[30px] font-bold tracking-tight text-white">SOS Incidents</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard testId="metric-sos-open" label="Open incidents" value={String(openCount)} accent="#EF4444" />
        <MetricCard testId="metric-sos-critical" label="Unresolved critical" value={String(critical)} accent="#DC2626" />
        <MetricCard testId="metric-sos-total" label="Total logged" value={String(list.length)} accent="#3B82F6" />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { v: "", l: "All" },
          { v: "open", l: "Open" },
          { v: "acknowledged", l: "Acknowledged" },
          { v: "escalated", l: "Escalated" },
          { v: "resolved", l: "Resolved" },
        ].map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setStatus(t.v)}
            data-testid={`sos-filter-${t.v || "all"}`}
            className={`rounded-lg border px-3.5 py-1.5 text-[12px] transition-colors duration-150 ${
              status === t.v
                ? "border-[#634E1D] bg-[#2A2312] font-semibold text-[#F5D061]"
                : "border-[#2A303F] text-[#9BA1B0] hover:text-white"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      <PanelCard title="Incident register" testId="sos-table-panel">
        <div className="overflow-x-auto">
          {isError || list.length === 0 ? (
            <EmptyState message="No SOS incidents for this filter." testId="sos-empty" />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[#232834] text-[11px] tracking-wider text-[#7E8698] uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Ride</th>
                  <th className="px-5 py-3 font-semibold">Trigger</th>
                  <th className="px-5 py-3 font-semibold">Reason</th>
                  <th className="px-5 py-3 font-semibold">Location</th>
                  <th className="px-5 py-3 font-semibold">Severity</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E222B]">
                {list.map((s) => (
                  <tr
                    key={s.id}
                    data-testid={`sos-row-${s.id}`}
                    className={`transition-colors duration-150 hover:bg-[#161A22] ${
                      s.status === "open" && s.severity === "critical" ? "bg-red-950/20" : ""
                    }`}
                  >
                    <td className="wl-mono px-5 py-3 text-[#F5D061]">
                      {s.ride_code}
                      <span className="block text-[11px] text-[#7E8698]">{fmtDateTime(s.created_at)}</span>
                    </td>
                    <td className="px-5 py-3 text-[#C2C7D4]">{titleize(s.trigger_source)}</td>
                    <td className="px-5 py-3 text-white">{s.reason}</td>
                    <td className="px-5 py-3 text-[#C2C7D4]">{s.location_label}</td>
                    <td className="px-5 py-3">
                      <ToneBadge value={s.severity} testId={`sos-severity-${s.id}`} />
                    </td>
                    <td className="px-5 py-3">
                      <ToneBadge value={s.status} testId={`sos-status-${s.id}`} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelected(s)}
                        data-testid={`sos-open-${s.id}`}
                        className="rounded-md border border-[#2A303F] px-2.5 py-1 text-[11px] text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white"
                      >
                        Console
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PanelCard>

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setSelected(null)}>
          <div
            data-testid="sos-detail-drawer"
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-md overflow-y-auto border-l border-[#2E3547] bg-[#12151D] p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="wl-overline">Safety console</p>
                <h2 className="wl-mono mt-1 text-xl font-bold text-[#F5D061]">{selected.ride_code}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                data-testid="sos-drawer-close"
                className="rounded-md border border-[#2A303F] px-2.5 py-1 text-xs text-[#9BA1B0] hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              <ToneBadge value={selected.severity} />
              <ToneBadge value={selected.status} testId="sos-drawer-status" />
            </div>

            <p className="mt-4 rounded-lg border border-[#7F1D1D] bg-[#2B1114] px-3 py-2.5 text-[13px] text-[#FF6B6B]">
              {selected.reason}
            </p>

            <dl className="mt-5 space-y-2.5 text-[13px]">
              {[
                ["Rider", `${selected.rider_name} · ${selected.rider_phone}`],
                ["Driver", `${selected.driver_name} · ${selected.driver_phone}`],
                ["Vehicle", selected.vehicle_number],
                ["Trigger", titleize(selected.trigger_source)],
                ["Location", selected.location_label],
                ["Coordinates", `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}`],
                ["Raised", fmtDateTime(selected.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-[#1E222B] pb-2">
                  <dt className="text-[#8E95A5]">{k}</dt>
                  <dd className="wl-mono text-right text-white">{v}</dd>
                </div>
              ))}
            </dl>

            <p className="wl-overline mt-6">Action history</p>
            <ul className="mt-2 space-y-2">
              {selected.action_history.map((h, i) => (
                <li key={i} className="rounded-lg border border-[#2A303F] bg-[#161A22] px-3 py-2 text-[12px] text-[#C2C7D4]">
                  {h}
                </li>
              ))}
            </ul>

            <p className="wl-overline mt-6">Response</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["acknowledged", "escalated", "resolved"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={act.isPending || selected.status === "resolved"}
                  onClick={() => act.mutate({ id: selected.id, status: s })}
                  data-testid={`sos-action-${s}`}
                  className="rounded-md border border-[#2A303F] px-2 py-2 text-[11px] font-semibold text-[#C2C7D4] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white disabled:opacity-40"
                >
                  {titleize(s)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
