import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { EmptyState, MetricCard, PanelCard } from "@/components/common/MetricCard";
import { ToneBadge } from "@/components/common/StatusBadge";
import type { CommissionConfig, SubscriptionPass } from "@/lib/types";
import { SERVICE_CATEGORIES, inr, titleize } from "@/lib/types";

function errMsg(e: unknown, fallback: string) {
  if (e instanceof ApiError && e.body && typeof e.body === "object") {
    const d = (e.body as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

export default function CommissionPasses() {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [form, setForm] = useState({
    name: "",
    duration: "weekly",
    price: "",
    fair_usage_rides: "",
    categories: [] as string[],
  });

  const { data: commissions, isError: cErr } = useQuery({
    queryKey: ["commissions"],
    queryFn: () => apiGet<CommissionConfig[]>("/commission-configs"),
  });
  const { data: passes, isError: pErr } = useQuery({
    queryKey: ["passes"],
    queryFn: () => apiGet<SubscriptionPass[]>("/passes"),
  });

  const saveComm = useMutation({
    mutationFn: (v: { category: string; percentage: number }) =>
      apiPut<CommissionConfig>(`/commission-configs/${v.category}`, {
        percentage: v.percentage,
        promo_override_pct: null,
      }),
    onSuccess: (c) => {
      toast.success(`${titleize(c.category)} commission set to ${c.percentage}%`);
      qc.invalidateQueries({ queryKey: ["commissions"] });
    },
    onError: (e) => toast.error(errMsg(e, "Commission update failed")),
  });

  const createPass = useMutation({
    mutationFn: () =>
      apiPost<SubscriptionPass>("/passes", {
        name: form.name,
        duration: form.duration,
        price: Number(form.price),
        categories: form.categories,
        fair_usage_rides: Number(form.fair_usage_rides || 0),
      }),
    onSuccess: (p) => {
      toast.success(`${p.name} created`);
      setForm({ name: "", duration: "weekly", price: "", fair_usage_rides: "", categories: [] });
      qc.invalidateQueries({ queryKey: ["passes"] });
    },
    onError: (e) => toast.error(errMsg(e, "Could not create pass")),
  });

  const togglePass = useMutation({
    mutationFn: (id: string) => apiPatch<SubscriptionPass>(`/passes/${id}/toggle`),
    onSuccess: (p) => {
      toast.success(`${p.name} is now ${p.status}`);
      qc.invalidateQueries({ queryKey: ["passes"] });
    },
    onError: (e) => toast.error(errMsg(e, "Could not toggle pass")),
  });

  const commList = commissions ?? [];
  const passList = passes ?? [];
  const subscribers = passList.reduce((a, p) => a + p.active_subscribers, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="wl-overline">Driver monetization</p>
        <h1 className="mt-1.5 text-[30px] font-bold tracking-tight text-white">
          Commission & Subscription Passes
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[#8E95A5]">
          Two independent engines feeding one earnings calculation: percentage commission per
          service, and zero-commission passes partners can buy instead.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard testId="metric-pass-plans" label="Pass plans" value={String(passList.length)} />
        <MetricCard
          testId="metric-pass-subscribers"
          label="Active subscribers"
          value={String(subscribers)}
          accent="#10B981"
        />
        <MetricCard
          testId="metric-avg-commission"
          label="Avg commission"
          value={
            commList.length
              ? `${(commList.reduce((a, c) => a + c.percentage, 0) / commList.length).toFixed(1)}%`
              : "—"
          }
          accent="#3B82F6"
        />
      </div>

      <PanelCard title="Commission by service category" testId="commission-panel">
        {cErr || commList.length === 0 ? (
          <EmptyState message="Commission configuration loads once the API is reachable." testId="commission-empty" />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {commList.map((c) => {
              const val = edits[c.category] ?? c.percentage;
              return (
                <div key={c.id} className="rounded-lg border border-[#2A303F] bg-[#161A22] p-4">
                  <p className="text-[13px] font-semibold text-white">{titleize(c.category)}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="40"
                      step="0.5"
                      value={val}
                      onChange={(e) => setEdits({ ...edits, [c.category]: Number(e.target.value) })}
                      data-testid={`commission-input-${c.category}`}
                      className="wl-mono w-full rounded-md border border-[#2A303F] bg-[#11141A] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#D4AF37]"
                    />
                    <span className="text-xs text-[#8E95A5]">%</span>
                  </div>
                  <button
                    type="button"
                    disabled={saveComm.isPending || val === c.percentage}
                    onClick={() => saveComm.mutate({ category: c.category, percentage: val })}
                    data-testid={`commission-save-${c.category}`}
                    className="mt-3 w-full rounded-md bg-[#D4AF37] px-3 py-1.5 text-[12px] font-semibold text-[#090A0C] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </PanelCard>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <PanelCard title="Zero-commission passes" className="lg:col-span-7" testId="passes-panel">
          {pErr || passList.length === 0 ? (
            <EmptyState message="No subscription passes configured yet." testId="passes-empty" />
          ) : (
            <div className="divide-y divide-[#1E222B]">
              {passList.map((p) => (
                <div key={p.id} data-testid={`pass-row-${p.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-white">{p.name}</p>
                    <p className="mt-1 text-[11px] text-[#8E95A5]">
                      {titleize(p.duration)} · {p.categories.map(titleize).join(", ")} · fair usage{" "}
                      {p.fair_usage_rides} rides
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="wl-mono text-sm font-semibold text-[#F5D061]">{inr(p.price)}</p>
                      <p className="text-[11px] text-[#7E8698]">{p.active_subscribers} subscribers</p>
                    </div>
                    <ToneBadge value={p.status} testId={`pass-status-${p.id}`} />
                    <button
                      type="button"
                      disabled={togglePass.isPending}
                      onClick={() => togglePass.mutate(p.id)}
                      data-testid={`pass-toggle-${p.id}`}
                      className="rounded-md border border-[#2A303F] px-2.5 py-1 text-[11px] text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white disabled:opacity-40"
                    >
                      {p.status === "active" ? "Pause" : "Activate"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard title="Create a pass plan" className="lg:col-span-5" testId="pass-create-panel">
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              createPass.mutate();
            }}
          >
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Plan name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Monthly Pro Partner"
                data-testid="pass-name-input"
                className="w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Duration</label>
                <select
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                  data-testid="pass-duration-select"
                  className="w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
                >
                  {["daily", "weekly", "monthly"].map((d) => (
                    <option key={d} value={d}>
                      {titleize(d)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Price (₹)</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  data-testid="pass-price-input"
                  className="wl-mono w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">
                Fair usage cap (rides)
              </label>
              <input
                type="number"
                min="0"
                value={form.fair_usage_rides}
                onChange={(e) => setForm({ ...form, fair_usage_rides: e.target.value })}
                data-testid="pass-fairusage-input"
                className="wl-mono w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
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
                      data-testid={`pass-category-${c}`}
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

            <button
              type="submit"
              disabled={createPass.isPending}
              data-testid="pass-create-submit"
              className="w-full rounded-lg bg-[#D4AF37] px-4 py-2.5 text-sm font-semibold text-[#090A0C] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-60"
            >
              {createPass.isPending ? "Creating…" : "Create pass plan"}
            </button>
          </form>
        </PanelCard>
      </div>
    </div>
  );
}
