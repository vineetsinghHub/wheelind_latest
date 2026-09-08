import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api";
import { EmptyState, MetricCard, PanelCard } from "@/components/common/MetricCard";
import type { WalletSummary } from "@/lib/types";
import { fmtDateTime, inr, inr2, titleize } from "@/lib/types";

const POOL_COLORS: Record<string, string> = {
  user_funded: "#D4AF37",
  promotional: "#8B5CF6",
  cashback: "#10B981",
};

export default function WalletLedger() {
  const [pool, setPool] = useState("");
  const [entryType, setEntryType] = useState("");
  const [q, setQ] = useState("");

  const params = new URLSearchParams();
  if (pool) params.set("pool", pool);
  if (entryType) params.set("entry_type", entryType);
  if (q) params.set("q", q);
  const qs = params.toString();

  const { data, isError } = useQuery({
    queryKey: ["wallet", pool, entryType, q],
    queryFn: () => apiGet<WalletSummary>(`/wallet/ledger${qs ? `?${qs}` : ""}`),
  });

  const entries = data?.entries ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="wl-overline">Ledger-first accounting</p>
        <h1 className="mt-1.5 text-[30px] font-bold tracking-tight text-white">Wallet Ledger</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#8E95A5]">
          Balances are derived from immutable ledger entries across three separate pools, so every
          refund and cashback stays traceable.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          testId="metric-user-funded"
          label="User-funded"
          value={data ? inr(data.user_funded_total) : "—"}
          sub="Cash / UPI / card top-ups"
        />
        <MetricCard
          testId="metric-promotional"
          label="Promotional"
          value={data ? inr(data.promotional_total) : "—"}
          sub="Campaign credits"
          accent="#8B5CF6"
        />
        <MetricCard
          testId="metric-cashback"
          label="Cashback"
          value={data ? inr(data.cashback_total) : "—"}
          sub="Earned rewards"
          accent="#10B981"
        />
        <MetricCard
          testId="metric-credits-30d"
          label="Credits · 30d"
          value={data ? inr(data.credits_30d) : "—"}
          accent="#3B82F6"
        />
        <MetricCard
          testId="metric-debits-30d"
          label="Debits · 30d"
          value={data ? inr(data.debits_30d) : "—"}
          accent="#F59E0B"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search account holder"
          data-testid="ledger-search-input"
          className="min-w-[240px] flex-1 rounded-lg border border-[#2A303F] bg-[#11141A] px-3.5 py-2 text-sm text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
        />
        <select
          value={pool}
          onChange={(e) => setPool(e.target.value)}
          data-testid="ledger-pool-filter"
          className="rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
        >
          <option value="">All balance pools</option>
          {["user_funded", "promotional", "cashback"].map((p) => (
            <option key={p} value={p}>
              {titleize(p)}
            </option>
          ))}
        </select>
        <select
          value={entryType}
          onChange={(e) => setEntryType(e.target.value)}
          data-testid="ledger-type-filter"
          className="rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
        >
          <option value="">Credits & debits</option>
          <option value="credit">Credits only</option>
          <option value="debit">Debits only</option>
        </select>
      </div>

      <PanelCard
        title="Transaction ledger"
        testId="ledger-table-panel"
        action={
          <span className="wl-mono text-[11px] text-[#7E8698]" data-testid="ledger-total-count">
            {data ? `${data.total_entries} entries` : "—"}
          </span>
        }
      >
        <div className="overflow-x-auto">
          {isError || entries.length === 0 ? (
            <EmptyState message="No ledger entries match these filters." testId="ledger-empty" />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[#232834] text-[11px] tracking-wider text-[#7E8698] uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Timestamp</th>
                  <th className="px-5 py-3 font-semibold">Account</th>
                  <th className="px-5 py-3 font-semibold">Pool</th>
                  <th className="px-5 py-3 font-semibold">Reason</th>
                  <th className="px-5 py-3 font-semibold">Ref</th>
                  <th className="px-5 py-3 text-right font-semibold">Amount</th>
                  <th className="px-5 py-3 text-right font-semibold">Balance after</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E222B]">
                {entries.map((e) => (
                  <tr key={e.id} data-testid={`ledger-row-${e.id}`} className="transition-colors duration-150 hover:bg-[#161A22]">
                    <td className="wl-mono px-5 py-3 text-[11px] text-[#8E95A5]">{fmtDateTime(e.created_at)}</td>
                    <td className="px-5 py-3 text-white">
                      {e.owner_name}
                      <span className="block text-[11px] text-[#7E8698]">{titleize(e.owner_type)}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          color: POOL_COLORS[e.pool],
                          borderColor: `${POOL_COLORS[e.pool]}55`,
                          backgroundColor: `${POOL_COLORS[e.pool]}18`,
                        }}
                      >
                        {titleize(e.pool)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#C2C7D4]">{e.reason}</td>
                    <td className="wl-mono px-5 py-3 text-[11px] text-[#7E8698]">{e.ref_id ?? "—"}</td>
                    <td
                      className="wl-mono px-5 py-3 text-right font-medium"
                      style={{ color: e.entry_type === "credit" ? "#34D399" : "#FF6B6B" }}
                    >
                      {e.entry_type === "credit" ? "+" : "−"}
                      {inr2(e.amount)}
                    </td>
                    <td className="wl-mono px-5 py-3 text-right text-white">{inr2(e.balance_after)}</td>
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
