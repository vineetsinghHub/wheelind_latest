import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiPost } from "@/lib/api";
import type { RiderPromo, RiderWallet } from "@/rider/lib/riderTypes";
import { fmtDateTime, inr2, titleize } from "@/lib/types";

const AMOUNTS = [200, 500, 1000, 2000];
const METHODS = [
  { v: "upi", l: "UPI" },
  { v: "credit_card", l: "Credit Card" },
  { v: "debit_card", l: "Debit Card" },
  { v: "net_banking", l: "Net Banking" },
];

export default function RiderWalletPage() {
  const qc = useQueryClient();
  const [method, setMethod] = useState("upi");
  const [custom, setCustom] = useState("");

  const { data } = useQuery({
    queryKey: ["rider-wallet"],
    queryFn: () => apiGet<RiderWallet>("/rider/wallet"),
  });
  const { data: promos } = useQuery({
    queryKey: ["rider-promos"],
    queryFn: () => apiGet<RiderPromo[]>("/rider/promos"),
  });

  const recharge = useMutation({
    mutationFn: (amount: number) => apiPost<RiderWallet>("/rider/wallet/recharge", { amount, method }),
    onSuccess: (w, amount) => {
      toast.success(`₹${amount} added — balance ${inr2(w.wallet_balance)}`);
      setCustom("");
      qc.invalidateQueries({ queryKey: ["rider-wallet"] });
      qc.invalidateQueries({ queryKey: ["rider-me"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError && e.body && typeof e.body === "object"
          ? String((e.body as { detail?: string }).detail ?? "Recharge failed")
          : "Recharge failed",
      ),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-white">Wallet</h1>
        <p className="mt-1 text-[13px] text-[#8E95A5]">Top up once, pay in a tap.</p>
      </div>

      <div className="rounded-2xl border border-[#634E1D] bg-gradient-to-br from-[#2A2312] to-[#11141A] p-5">
        <p className="flex items-center gap-1.5 text-[11px] tracking-[0.14em] text-[#C5A25D] uppercase">
          <Wallet size={12} /> Available balance
        </p>
        <p className="wl-mono mt-2 text-[34px] leading-none font-bold text-white" data-testid="wallet-balance">
          {data ? inr2(data.wallet_balance) : "—"}
        </p>
        <div className="mt-4 flex gap-4 border-t border-[#634E1D]/40 pt-3">
          <div>
            <p className="text-[10px] text-[#8E95A5]">Promo credit</p>
            <p className="wl-mono text-[13px] font-semibold text-[#A78BFA]" data-testid="wallet-promo">
              {data ? inr2(data.promo_balance) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#8E95A5]">Cashback</p>
            <p className="wl-mono text-[13px] font-semibold text-[#34D399]" data-testid="wallet-cashback">
              {data ? inr2(data.cashback_balance) : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#232834] bg-[#11141A] p-4">
        <p className="wl-overline">Add money</p>
        <p className="mt-1 text-[11px] text-[#7E8698]">
          Top up ₹1,000 or more and earn 5% cashback (up to ₹100).
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {METHODS.map((m) => (
            <button
              key={m.v}
              type="button"
              onClick={() => setMethod(m.v)}
              data-testid={`recharge-method-${m.v}`}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors duration-150 ${
                method === m.v
                  ? "border-[#634E1D] bg-[#2A2312] font-semibold text-[#F5D061]"
                  : "border-[#2A303F] text-[#9BA1B0] hover:text-white"
              }`}
            >
              {m.l}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {AMOUNTS.map((a) => (
            <button
              key={a}
              type="button"
              disabled={recharge.isPending}
              onClick={() => recharge.mutate(a)}
              data-testid={`recharge-${a}`}
              className="wl-mono rounded-xl border border-[#2A303F] py-2.5 text-[13px] font-semibold text-white transition-colors duration-150 hover:border-[#D4AF37]/60 disabled:opacity-40"
            >
              ₹{a}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
            placeholder="Other amount"
            data-testid="recharge-custom-input"
            className="wl-mono flex-1 rounded-xl border border-[#2A303F] bg-[#0D0F14] px-3.5 py-2.5 text-[13px] text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
          />
          <button
            type="button"
            disabled={recharge.isPending || !custom}
            onClick={() => recharge.mutate(Number(custom))}
            data-testid="recharge-custom-submit"
            className="flex items-center gap-1.5 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-[13px] font-semibold text-[#0B0C10] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-50"
          >
            <Plus size={14} /> Add
          </button>
        </div>
        <p className="mt-2 text-[10px] text-[#5E6575]">
          Payments are simulated — no gateway is connected.
        </p>
      </div>

      {promos && promos.length > 0 ? (
        <div className="rounded-2xl border border-[#232834] bg-[#11141A] p-4">
          <p className="wl-overline flex items-center gap-1.5">
            <Gift size={12} /> Live offers
          </p>
          <ul className="mt-3 space-y-2">
            {promos.map((p) => (
              <li
                key={p.id}
                data-testid={`wallet-promo-${p.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#2A303F] bg-[#161A22] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] text-white">{p.name}</p>
                  <p className="wl-mono mt-0.5 text-[10px] text-[#7E8698]">
                    {p.code ?? "auto-applied"} · till {p.ends_on}
                  </p>
                </div>
                <span className="wl-mono shrink-0 text-[12px] font-semibold text-[#F5D061]">
                  {p.discount_type === "percentage" ? `${p.value}%` : `₹${p.value}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[#232834] bg-[#11141A]">
        <header className="border-b border-[#232834] px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Transactions</h2>
        </header>
        {!data || data.entries.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-[#8E95A5]" data-testid="wallet-empty">
            No transactions yet.
          </p>
        ) : (
          <ul className="divide-y divide-[#1E222B]">
            {data.entries.map((e) => (
              <li key={e.id} data-testid={`wallet-entry-${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-white">{e.reason}</p>
                  <p className="wl-mono mt-0.5 text-[10px] text-[#7E8698]">
                    {titleize(e.pool)} · {fmtDateTime(e.created_at)}
                    {e.ref_id ? ` · ${e.ref_id}` : ""}
                  </p>
                </div>
                <p
                  className="wl-mono shrink-0 text-[13px] font-semibold"
                  style={{ color: e.entry_type === "credit" ? "#34D399" : "#FF6B6B" }}
                >
                  {e.entry_type === "credit" ? "+" : "−"}
                  {inr2(e.amount)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
