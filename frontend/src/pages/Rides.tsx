import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError, apiGet, apiPatch, apiPost } from "@/lib/api";
import { EmptyState, PanelCard } from "@/components/common/MetricCard";
import { StatusBadge, ToneBadge } from "@/components/common/StatusBadge";
import type { Ride, RideList } from "@/lib/types";
import { RIDE_STATES, SERVICE_CATEGORIES, fmtDateTime, inr2, titleize } from "@/lib/types";

function errMsg(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.body && typeof err.body === "object") {
    const d = (err.body as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

export default function Rides() {
  const qc = useQueryClient();
  const [state, setState] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Ride | null>(null);
  const [refundAmount, setRefundAmount] = useState("");

  const params = new URLSearchParams();
  if (state) params.set("state", state);
  if (category) params.set("category", category);
  if (q) params.set("q", q);
  const qs = params.toString();

  const { data, isError } = useQuery({
    queryKey: ["rides", state, category, q],
    queryFn: () => apiGet<RideList>(`/rides${qs ? `?${qs}` : ""}`),
  });

  const changeState = useMutation({
    mutationFn: (vars: { id: string; state: string }) =>
      apiPatch<Ride>(`/rides/${vars.id}/state`, { state: vars.state, reason: "Updated from admin console" }),
    onSuccess: (ride) => {
      toast.success(`${ride.code} moved to ${titleize(ride.state)}`);
      setSelected(ride);
      qc.invalidateQueries({ queryKey: ["rides"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(errMsg(e, "Could not change ride state")),
  });

  const refund = useMutation({
    mutationFn: (vars: { id: string; amount: number }) =>
      apiPost<Ride>(`/rides/${vars.id}/refund`, { amount: vars.amount, reason: "Admin-issued refund" }),
    onSuccess: (ride) => {
      toast.success(`Refund credited to ${ride.rider_name}'s wallet`);
      setSelected(ride);
      setRefundAmount("");
      qc.invalidateQueries({ queryKey: ["rides"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e) => toast.error(errMsg(e, "Refund failed")),
  });

  const rides = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="wl-overline">Ride lookup & dispute resolution</p>
          <h1 className="mt-1.5 text-[30px] font-bold tracking-tight text-white">Rides</h1>
        </div>
        <span className="wl-mono text-xs text-[#8E95A5]" data-testid="rides-total-count">
          {data ? `${data.total} rides matched` : "—"}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ride code, rider or driver"
          data-testid="rides-search-input"
          className="min-w-[260px] flex-1 rounded-lg border border-[#2A303F] bg-[#11141A] px-3.5 py-2 text-sm text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
        />
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          data-testid="rides-state-filter"
          className="rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
        >
          <option value="">All lifecycle states</option>
          {RIDE_STATES.map((s) => (
            <option key={s} value={s}>
              {titleize(s)}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          data-testid="rides-category-filter"
          className="rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
        >
          <option value="">All services</option>
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {titleize(c)}
            </option>
          ))}
        </select>
      </div>

      <PanelCard title="Ride ledger" testId="rides-table-panel">
        <div className="overflow-x-auto">
          {isError || rides.length === 0 ? (
            <EmptyState message="No rides match these filters." testId="rides-empty" />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[#232834] text-[11px] tracking-wider text-[#7E8698] uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Code</th>
                  <th className="px-5 py-3 font-semibold">Route</th>
                  <th className="px-5 py-3 font-semibold">Rider / Driver</th>
                  <th className="px-5 py-3 font-semibold">Service</th>
                  <th className="px-5 py-3 font-semibold">State</th>
                  <th className="px-5 py-3 font-semibold">Payment</th>
                  <th className="px-5 py-3 text-right font-semibold">Fare</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E222B]">
                {rides.map((r) => (
                  <tr
                    key={r.id}
                    data-testid={`ride-row-${r.code}`}
                    className="transition-colors duration-150 hover:bg-[#161A22]"
                  >
                    <td className="wl-mono px-5 py-3 text-[#F5D061]">{r.code}</td>
                    <td className="px-5 py-3 text-white">
                      {r.pickup} <span className="text-[#5E6575]">→</span> {r.drop}
                      <span className="wl-mono block text-[11px] text-[#7E8698]">
                        {r.distance_km} km · {fmtDateTime(r.created_at)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#C2C7D4]">
                      {r.rider_name}
                      <span className="block text-[11px] text-[#7E8698]">{r.driver_name ?? "Unassigned"}</span>
                    </td>
                    <td className="px-5 py-3 text-[#C2C7D4]">{titleize(r.category)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge state={r.state} testId={`ride-state-${r.code}`} />
                    </td>
                    <td className="px-5 py-3">
                      <ToneBadge value={r.payment_status} />
                      <span className="mt-1 block text-[11px] text-[#7E8698]">{titleize(r.payment_method)}</span>
                    </td>
                    <td className="wl-mono px-5 py-3 text-right text-white">{inr2(r.fare.total)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(r);
                          setRefundAmount("");
                        }}
                        data-testid={`ride-view-${r.code}`}
                        className="rounded-md border border-[#2A303F] px-2.5 py-1 text-[11px] text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white"
                      >
                        View
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
            data-testid="ride-detail-drawer"
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-md overflow-y-auto border-l border-[#2E3547] bg-[#12151D] p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="wl-overline">Ride detail</p>
                <h2 className="wl-mono mt-1 text-xl font-bold text-[#F5D061]">{selected.code}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                data-testid="ride-drawer-close"
                className="rounded-md border border-[#2A303F] px-2.5 py-1 text-xs text-[#9BA1B0] hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge state={selected.state} testId="ride-drawer-state" />
              <ToneBadge value={selected.payment_status} />
              {selected.otp_verified ? (
                <ToneBadge value="approved" />
              ) : (
                <span className="rounded-md border border-[#7F1D1D] bg-[#2B1114] px-2 py-0.5 text-[11px] font-semibold text-[#FF6B6B]">
                  OTP unverified
                </span>
              )}
            </div>

            <dl className="mt-5 space-y-2.5 text-[13px]">
              {[
                ["Rider", selected.rider_name],
                ["Driver", selected.driver_name ?? "Unassigned"],
                ["Service", titleize(selected.category)],
                ["Pickup", selected.pickup],
                ["Drop", selected.drop],
                ["Distance", `${selected.distance_km} km · ${selected.duration_min} min`],
                ["Trip OTP", selected.otp],
                ["Surge", `${selected.surge_multiplier}x`],
                ["Booked", fmtDateTime(selected.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-[#1E222B] pb-2">
                  <dt className="text-[#8E95A5]">{k}</dt>
                  <dd className="wl-mono text-right text-white">{v}</dd>
                </div>
              ))}
            </dl>

            <p className="wl-overline mt-6">Fare breakup</p>
            <dl className="mt-2 space-y-1.5 text-[12px]">
              {[
                ["Base fare", selected.fare.base_fare],
                ["Distance charge", selected.fare.distance_charge],
                ["Time charge", selected.fare.time_charge],
                ["Waiting charge", selected.fare.waiting_charge],
                ["Surge amount", selected.fare.surge_amount],
                ["Night charge", selected.fare.night_charge],
                ["Rider added fare", selected.fare.rider_added_fare],
                ["Toll & parking", selected.fare.toll_parking],
                ["Discount", -selected.fare.discount],
                ["Tax (GST)", selected.fare.tax],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between">
                  <dt className="text-[#8E95A5]">{k}</dt>
                  <dd className="wl-mono text-[#C2C7D4]">{inr2(Number(v))}</dd>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-[#2E3547] pt-2">
                <dt className="font-semibold text-white">Total</dt>
                <dd className="wl-mono font-semibold text-[#F5D061]" data-testid="ride-drawer-total">
                  {inr2(selected.fare.total)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#8E95A5]">Platform commission</dt>
                <dd className="wl-mono text-[#C2C7D4]">{inr2(selected.commission)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#8E95A5]">Driver earning</dt>
                <dd className="wl-mono text-[#34D399]">{inr2(selected.driver_earning)}</dd>
              </div>
            </dl>

            <p className="wl-overline mt-6">Lifecycle actions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {["disputed", "cancelled", "completed"].map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={changeState.isPending || selected.state === s}
                  onClick={() => changeState.mutate({ id: selected.id, state: s })}
                  data-testid={`ride-action-${s}`}
                  className="rounded-md border border-[#2A303F] px-3 py-1.5 text-[12px] text-[#C2C7D4] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white disabled:opacity-40"
                >
                  Mark {titleize(s)}
                </button>
              ))}
            </div>

            <p className="wl-overline mt-6">Issue refund to rider wallet</p>
            <div className="mt-2 flex gap-2">
              <input
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="Amount ₹"
                inputMode="decimal"
                data-testid="ride-refund-amount-input"
                className="wl-mono flex-1 rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
              />
              <button
                type="button"
                disabled={refund.isPending || !refundAmount}
                onClick={() => refund.mutate({ id: selected.id, amount: Number(refundAmount) })}
                data-testid="ride-refund-submit"
                className="rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#090A0C] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-50"
              >
                Refund
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
