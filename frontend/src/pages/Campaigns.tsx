import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError, apiGet, apiPatch, apiPost } from "@/lib/api";
import { EmptyState, MetricCard, PanelCard } from "@/components/common/MetricCard";
import { ToneBadge } from "@/components/common/StatusBadge";
import type { Campaign } from "@/lib/types";
import { SERVICE_CATEGORIES, inr, titleize } from "@/lib/types";

function errMsg(e: unknown, fallback: string) {
  if (e instanceof ApiError && e.body && typeof e.body === "object") {
    const d = (e.body as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

export default function Campaigns() {
  const qc = useQueryClient();
  const [appFilter, setAppFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    app: "rider",
    type: "festival",
    code: "",
    discount_type: "percentage",
    value: "",
    max_discount: "",
    starts_on: "2026-04-01",
    ends_on: "2026-04-30",
    budget_cap: "",
    usage_limit_per_user: "1",
    stackable: false,
    categories: [] as string[],
  });

  const qs = appFilter ? `?app=${appFilter}` : "";
  const { data, isError } = useQuery({
    queryKey: ["campaigns", appFilter],
    queryFn: () => apiGet<Campaign[]>(`/campaigns${qs}`),
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost<Campaign>("/campaigns", {
        name: form.name,
        app: form.app,
        type: form.type,
        code: form.code || null,
        discount_type: form.discount_type,
        value: Number(form.value),
        max_discount: Number(form.max_discount || 0),
        categories: form.categories,
        audience: "all",
        starts_on: form.starts_on,
        ends_on: form.ends_on,
        budget_cap: Number(form.budget_cap),
        usage_limit_per_user: Number(form.usage_limit_per_user || 1),
        stackable: form.stackable,
      }),
    onSuccess: (c) => {
      toast.success(`${c.name} created as draft`);
      setOpen(false);
      setForm({ ...form, name: "", code: "", value: "", budget_cap: "", categories: [] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e) => toast.error(errMsg(e, "Could not create campaign")),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      apiPatch<Campaign>(`/campaigns/${v.id}/status`, { status: v.status }),
    onSuccess: (c) => {
      toast.success(`${c.name} is now ${c.status}`);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e) => toast.error(errMsg(e, "Could not change campaign status")),
  });

  const list = data ?? [];
  const activeCount = list.filter((c) => c.status === "active").length;
  const budget = list.reduce((a, c) => a + c.budget_cap, 0);
  const used = list.reduce((a, c) => a + c.budget_used, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="wl-overline">Offers, incentives & campaigns</p>
          <h1 className="mt-1.5 text-[30px] font-bold tracking-tight text-white">Campaigns</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#8E95A5]">
            Every campaign is versioned, budget-capped and audit-logged — no free-form promotions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          data-testid="campaign-new-button"
          className="rounded-lg bg-[#D4AF37] px-4 py-2.5 text-sm font-semibold text-[#090A0C] transition-colors duration-150 hover:bg-[#E5C158]"
        >
          {open ? "Close form" : "New campaign"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard testId="metric-active-campaigns" label="Active campaigns" value={String(activeCount)} />
        <MetricCard testId="metric-campaign-budget" label="Total budget cap" value={inr(budget)} accent="#3B82F6" />
        <MetricCard
          testId="metric-campaign-spend"
          label="Budget consumed"
          value={inr(used)}
          sub={budget ? `${((used / budget) * 100).toFixed(1)}% of allocation` : undefined}
          accent="#10B981"
        />
      </div>

      {open ? (
        <PanelCard title="Create campaign" testId="campaign-create-panel">
          <form
            className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Campaign name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Durga Puja Ride Fest"
                data-testid="campaign-name-input"
                className="w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Target app</label>
              <select
                value={form.app}
                onChange={(e) => setForm({ ...form, app: e.target.value })}
                data-testid="campaign-app-select"
                className="w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
              >
                <option value="rider">Rider app</option>
                <option value="driver">Driver app</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Promo code</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="PUJO25"
                data-testid="campaign-code-input"
                className="wl-mono w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Benefit type</label>
              <select
                value={form.discount_type}
                onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
                data-testid="campaign-discount-type-select"
                className="w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
              >
                {["percentage", "flat", "cashback", "bonus"].map((d) => (
                  <option key={d} value={d}>
                    {titleize(d)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Value</label>
              <input
                required
                type="number"
                min="1"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                data-testid="campaign-value-input"
                className="wl-mono w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Budget cap (₹)</label>
              <input
                required
                type="number"
                min="1"
                value={form.budget_cap}
                onChange={(e) => setForm({ ...form, budget_cap: e.target.value })}
                data-testid="campaign-budget-input"
                className="wl-mono w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Starts on</label>
              <input
                type="date"
                required
                value={form.starts_on}
                onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
                data-testid="campaign-start-input"
                className="wl-mono w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Ends on</label>
              <input
                type="date"
                required
                value={form.ends_on}
                onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
                data-testid="campaign-end-input"
                className="wl-mono w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-2 block text-xs font-medium text-[#9BA1B0]">
                Eligible categories
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SERVICE_CATEGORIES.map((c) => {
                  const on = form.categories.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          categories: on
                            ? form.categories.filter((x) => x !== c)
                            : [...form.categories, c],
                        })
                      }
                      data-testid={`campaign-category-${c}`}
                      className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors duration-150 ${
                        on
                          ? "border-[#634E1D] bg-[#2A2312] text-[#F5D061]"
                          : "border-[#2A303F] text-[#9BA1B0] hover:text-white"
                      }`}
                    >
                      {titleize(c)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={create.isPending}
                data-testid="campaign-create-submit"
                className="rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-semibold text-[#090A0C] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-60"
              >
                {create.isPending ? "Creating…" : "Create campaign"}
              </button>
            </div>
          </form>
        </PanelCard>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {[
          { v: "", l: "All apps" },
          { v: "rider", l: "Rider app" },
          { v: "driver", l: "Driver app" },
        ].map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setAppFilter(t.v)}
            data-testid={`campaign-filter-${t.v || "all"}`}
            className={`rounded-lg border px-3.5 py-1.5 text-[12px] transition-colors duration-150 ${
              appFilter === t.v
                ? "border-[#634E1D] bg-[#2A2312] font-semibold text-[#F5D061]"
                : "border-[#2A303F] text-[#9BA1B0] hover:text-white"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      <PanelCard title="Campaign register" testId="campaigns-table-panel">
        <div className="overflow-x-auto">
          {isError || list.length === 0 ? (
            <EmptyState message="No campaigns configured for this filter." testId="campaigns-empty" />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[#232834] text-[11px] tracking-wider text-[#7E8698] uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Campaign</th>
                  <th className="px-5 py-3 font-semibold">App</th>
                  <th className="px-5 py-3 font-semibold">Benefit</th>
                  <th className="px-5 py-3 font-semibold">Window</th>
                  <th className="px-5 py-3 font-semibold">Budget</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E222B]">
                {list.map((c) => (
                  <tr key={c.id} data-testid={`campaign-row-${c.id}`} className="transition-colors duration-150 hover:bg-[#161A22]">
                    <td className="px-5 py-3 text-white">
                      {c.name}
                      <span className="wl-mono block text-[11px] text-[#7E8698]">
                        {c.code ?? "no code"} · v{c.version} · {c.redemptions} redemptions
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#C2C7D4]">{titleize(c.app)}</td>
                    <td className="px-5 py-3 text-[#C2C7D4]">
                      {c.discount_type === "percentage" ? `${c.value}%` : inr(c.value)}
                      <span className="block text-[11px] text-[#7E8698]">{titleize(c.discount_type)}</span>
                    </td>
                    <td className="wl-mono px-5 py-3 text-[11px] text-[#C2C7D4]">
                      {c.starts_on}
                      <span className="block text-[#7E8698]">{c.ends_on}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="wl-mono text-[12px] text-white">{inr(c.budget_used)}</span>
                      <span className="wl-mono block text-[11px] text-[#7E8698]">of {inr(c.budget_cap)}</span>
                      <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-[#1D2330]">
                        <div
                          className="h-full rounded-full bg-[#D4AF37]"
                          style={{ width: `${Math.min(100, (c.budget_used / c.budget_cap) * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <ToneBadge value={c.status} testId={`campaign-status-${c.id}`} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(["active", "paused", "expired"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={setStatus.isPending || c.status === s || c.status === "expired"}
                            onClick={() => setStatus.mutate({ id: c.id, status: s })}
                            data-testid={`campaign-set-${s}-${c.id}`}
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
