import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError, apiGet, apiPatch } from "@/lib/api";
import { EmptyState, PanelCard } from "@/components/common/MetricCard";
import { ToneBadge } from "@/components/common/StatusBadge";
import type { Rider } from "@/lib/types";
import { inr2, titleize } from "@/lib/types";

export default function Riders() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  const qs = params.toString();

  const { data, isError } = useQuery({
    queryKey: ["riders", q, status],
    queryFn: () => apiGet<Rider[]>(`/riders${qs ? `?${qs}` : ""}`),
  });

  const update = useMutation({
    mutationFn: (v: { id: string; status: string; prepaid_only: boolean }) =>
      apiPatch<Rider>(`/riders/${v.id}/status`, { status: v.status, prepaid_only: v.prepaid_only }),
    onSuccess: (r) => {
      toast.success(`${r.name} set to ${titleize(r.status)}`);
      qc.invalidateQueries({ queryKey: ["riders"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? "Could not update rider status" : "Could not reach the API",
      ),
  });

  const list = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="wl-overline">Customer directory</p>
          <h1 className="mt-1.5 text-[30px] font-bold tracking-tight text-white">Riders</h1>
        </div>
        <span className="wl-mono text-xs text-[#8E95A5]" data-testid="riders-total-count">
          {list.length} riders
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search rider name or phone"
          data-testid="riders-search-input"
          className="min-w-[260px] flex-1 rounded-lg border border-[#2A303F] bg-[#11141A] px-3.5 py-2 text-sm text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          data-testid="riders-status-filter"
          className="rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
        >
          <option value="">All account states</option>
          {["active", "restricted", "blocked"].map((s) => (
            <option key={s} value={s}>
              {titleize(s)}
            </option>
          ))}
        </select>
      </div>

      <PanelCard title="Rider accounts" testId="riders-table-panel">
        <div className="overflow-x-auto">
          {isError || list.length === 0 ? (
            <EmptyState message="No riders match these filters." testId="riders-empty" />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[#232834] text-[11px] tracking-wider text-[#7E8698] uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Rider</th>
                  <th className="px-5 py-3 font-semibold">Rides</th>
                  <th className="px-5 py-3 text-right font-semibold">Wallet</th>
                  <th className="px-5 py-3 text-right font-semibold">Promo</th>
                  <th className="px-5 py-3 text-right font-semibold">Cashback</th>
                  <th className="px-5 py-3 font-semibold">Account</th>
                  <th className="px-5 py-3 font-semibold">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E222B]">
                {list.map((r) => (
                  <tr key={r.id} data-testid={`rider-row-${r.id}`} className="transition-colors duration-150 hover:bg-[#161A22]">
                    <td className="px-5 py-3 text-white">
                      {r.name}
                      <span className="wl-mono block text-[11px] text-[#7E8698]">{r.phone}</span>
                    </td>
                    <td className="wl-mono px-5 py-3 text-[#C2C7D4]">{r.total_rides}</td>
                    <td className="wl-mono px-5 py-3 text-right text-white">{inr2(r.wallet_balance)}</td>
                    <td className="wl-mono px-5 py-3 text-right text-[#F5D061]">{inr2(r.promo_balance)}</td>
                    <td className="wl-mono px-5 py-3 text-right text-[#34D399]">{inr2(r.cashback_balance)}</td>
                    <td className="px-5 py-3">
                      <ToneBadge value={r.status} testId={`rider-status-${r.id}`} />
                      {r.prepaid_only ? (
                        <span className="mt-1 block text-[10px] text-[#F97316]">Prepaid only</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1.5">
                        {(["active", "restricted", "blocked"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={update.isPending || r.status === s}
                            onClick={() =>
                              update.mutate({ id: r.id, status: s, prepaid_only: s !== "active" })
                            }
                            data-testid={`rider-set-${s}-${r.id}`}
                            className="rounded-md border border-[#2A303F] px-2 py-1 text-[10px] text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white disabled:opacity-30"
                          >
                            {titleize(s)}
                          </button>
                        ))}
                      </div>
                    </td>
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
