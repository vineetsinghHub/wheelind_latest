import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api";
import { EmptyState, PanelCard } from "@/components/common/MetricCard";
import type { AuditLogList } from "@/lib/types";
import { fmtDateTime, titleize } from "@/lib/types";

const ENTITIES = [
  "",
  "fare_config",
  "commission_config",
  "driver",
  "rider",
  "ride",
  "campaign",
  "subscription_pass",
  "feature_flag",
  "sos_incident",
];

export default function AuditLogs() {
  const [entity, setEntity] = useState("");
  const [q, setQ] = useState("");

  const params = new URLSearchParams();
  if (entity) params.set("entity", entity);
  if (q) params.set("q", q);
  const qs = params.toString();

  const { data, isError } = useQuery({
    queryKey: ["audit", entity, q],
    queryFn: () => apiGet<AuditLogList>(`/audit-logs${qs ? `?${qs}` : ""}`),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="wl-overline">Traceability</p>
        <h1 className="mt-1.5 text-[30px] font-bold tracking-tight text-white">Audit Logs</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#8E95A5]">
          Every pricing, KYC, campaign, refund and safety action taken in this console is recorded
          with actor and role.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search actor or action"
          data-testid="audit-search-input"
          className="min-w-[240px] flex-1 rounded-lg border border-[#2A303F] bg-[#11141A] px-3.5 py-2 text-sm text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
        />
        <select
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          data-testid="audit-entity-filter"
          className="rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
        >
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e ? titleize(e) : "All entities"}
            </option>
          ))}
        </select>
      </div>

      <PanelCard
        title="Action trail"
        testId="audit-table-panel"
        action={
          <span className="wl-mono text-[11px] text-[#7E8698]" data-testid="audit-total-count">
            {data ? `${data.total} entries` : "—"}
          </span>
        }
      >
        <div className="overflow-x-auto">
          {isError || items.length === 0 ? (
            <EmptyState message="No audit entries match these filters." testId="audit-empty" />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[#232834] text-[11px] tracking-wider text-[#7E8698] uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Timestamp</th>
                  <th className="px-5 py-3 font-semibold">Actor</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                  <th className="px-5 py-3 font-semibold">Entity</th>
                  <th className="px-5 py-3 font-semibold">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E222B]">
                {items.map((l) => (
                  <tr key={l.id} data-testid={`audit-row-${l.id}`} className="transition-colors duration-150 hover:bg-[#161A22]">
                    <td className="wl-mono px-5 py-3 text-[11px] text-[#8E95A5]">{fmtDateTime(l.created_at)}</td>
                    <td className="px-5 py-3 text-white">
                      {l.actor}
                      <span className="block text-[11px] text-[#C5A25D]">{titleize(l.actor_role)}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-md border border-[#2A303F] bg-[#1D2330] px-2 py-0.5 text-[11px] text-[#F5D061]">
                        {titleize(l.action)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#C2C7D4]">{titleize(l.entity)}</td>
                    <td className="wl-mono px-5 py-3 text-[11px] text-[#7E8698]">{l.entity_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PanelCard>
    </div>
  );
}
