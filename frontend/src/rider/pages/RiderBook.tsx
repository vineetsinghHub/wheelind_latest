import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BadgePercent, MapPin, Navigation, Search, Users } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiPost } from "@/lib/api";
import type { CategoryEstimate, EstimateResponse, Place, RideWithDriver, RiderPromo } from "@/rider/lib/riderTypes";
import { PAYMENT_METHODS } from "@/rider/lib/riderTypes";
import type { Ride } from "@/lib/types";
import { inr2 } from "@/lib/types";

function msg(e: unknown, fallback: string) {
  if (e instanceof ApiError && e.body && typeof e.body === "object") {
    const d = (e.body as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

function PlaceField({
  label,
  value,
  onPick,
  testId,
  accent,
}: {
  label: string;
  value: Place | null;
  onPick: (p: Place) => void;
  testId: string;
  accent: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["places", q],
    queryFn: () => apiGet<Place[]>(`/rider/places?q=${encodeURIComponent(q)}`),
    enabled: open,
  });

  return (
    <div className="relative">
      <label className="mb-1.5 block text-[11px] font-medium text-[#9BA1B0]">{label}</label>
      <div className="flex items-center gap-2 rounded-xl border border-[#2A303F] bg-[#0D0F14] px-3 py-2.5 focus-within:border-[#D4AF37]">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
        <input
          value={open ? q : value?.label ?? ""}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            setOpen(true);
            setQ("");
          }}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder="Search a place in Kolkata"
          data-testid={testId}
          className="w-full bg-transparent text-[14px] text-white outline-none placeholder:text-[#5E6575]"
        />
        <Search size={14} className="shrink-0 text-[#5E6575]" />
      </div>

      {open && data && data.length > 0 ? (
        <ul
          data-testid={`${testId}-results`}
          className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-[#2E3547] bg-[#12151D] shadow-2xl"
        >
          {data.map((p) => (
            <li key={p.label}>
              <button
                type="button"
                onMouseDown={() => {
                  onPick(p);
                  setOpen(false);
                }}
                data-testid={`place-option-${p.name.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-[#1A1E28]"
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-[#D4AF37]" />
                <span>
                  <span className="block text-[13px] text-white">{p.name}</span>
                  <span className="block text-[11px] text-[#7E8698]">{p.area}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function RiderBook() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [payment, setPayment] = useState<string>("upi");
  const [promo, setPromo] = useState("");

  // An in-flight ride owns the screen — jump straight to tracking.
  const { data: active } = useQuery({
    queryKey: ["rider-active"],
    queryFn: () => apiGet<RideWithDriver | null>("/rider/rides/active"),
  });
  useEffect(() => {
    if (active?.ride) navigate(`/trip/${active.ride.id}`, { replace: true });
  }, [active, navigate]);

  const { data: promos } = useQuery({
    queryKey: ["rider-promos"],
    queryFn: () => apiGet<RiderPromo[]>("/rider/promos"),
  });

  const { data: estimate, isFetching } = useQuery({
    queryKey: ["estimate", pickup?.label, drop?.label],
    queryFn: () =>
      apiPost<EstimateResponse>("/rider/estimate", {
        pickup_lat: pickup!.lat,
        pickup_lng: pickup!.lng,
        drop_lat: drop!.lat,
        drop_lng: drop!.lng,
      }),
    enabled: !!pickup && !!drop,
  });

  const book = useMutation({
    mutationFn: (opt: CategoryEstimate) =>
      apiPost<Ride>("/rider/rides", {
        category: opt.category,
        pickup: pickup!.name,
        drop: drop!.name,
        pickup_lat: pickup!.lat,
        pickup_lng: pickup!.lng,
        drop_lat: drop!.lat,
        drop_lng: drop!.lng,
        payment_method: payment,
        promo_code: promo.trim() ? promo.trim().toUpperCase() : null,
        rider_added_fare: 0,
      }),
    onSuccess: (ride) => {
      qc.invalidateQueries({ queryKey: ["rider-active"] });
      toast.success(`${ride.code} requested — finding you a partner`);
      navigate(`/trip/${ride.id}`);
    },
    onError: (e) => toast.error(msg(e, "Could not request the ride")),
  });

  const options = estimate?.options ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-white">Where to?</h1>
        <p className="mt-1 text-[13px] text-[#8E95A5]">Upfront fare, no surprises.</p>
      </div>

      <div className="space-y-3 rounded-2xl border border-[#232834] bg-[#11141A] p-4">
        <PlaceField
          label="PICKUP"
          value={pickup}
          onPick={setPickup}
          testId="pickup-input"
          accent="#34D399"
        />
        <PlaceField label="DROP" value={drop} onPick={setDrop} testId="drop-input" accent="#F5D061" />
        {estimate ? (
          <p className="wl-mono flex items-center gap-1.5 text-[11px] text-[#8E95A5]" data-testid="trip-distance">
            <Navigation size={11} /> {estimate.distance_km} km by road
          </p>
        ) : null}
      </div>

      {promos && promos.length > 0 ? (
        <div className="rounded-2xl border border-[#232834] bg-[#11141A] p-4">
          <p className="wl-overline flex items-center gap-1.5">
            <BadgePercent size={12} /> Offers for you
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {promos.map((p) =>
              p.code ? (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPromo(p.code!);
                    toast.success(`${p.code} applied`);
                  }}
                  data-testid={`promo-${p.code}`}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors duration-150 ${
                    promo === p.code
                      ? "border-[#634E1D] bg-[#2A2312] font-semibold text-[#F5D061]"
                      : "border-[#2A303F] text-[#9BA1B0] hover:text-white"
                  }`}
                >
                  <span className="wl-mono">{p.code}</span> ·{" "}
                  {p.discount_type === "percentage" ? `${p.value}% off` : `₹${p.value} off`}
                </button>
              ) : null,
            )}
          </div>
        </div>
      ) : null}

      {pickup && drop ? (
        <div className="rounded-2xl border border-[#232834] bg-[#11141A]">
          <header className="flex items-center justify-between border-b border-[#232834] px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Choose a ride</h2>
            {isFetching ? <span className="text-[11px] text-[#7E8698]">Pricing…</span> : null}
          </header>
          <div className="divide-y divide-[#1E222B]">
            {options.length === 0 && !isFetching ? (
              <p className="px-4 py-8 text-center text-[13px] text-[#8E95A5]">No services configured.</p>
            ) : null}
            {options.map((o) => {
              const on = selected === o.category;
              return (
                <button
                  key={o.category}
                  type="button"
                  disabled={!o.available}
                  onClick={() => setSelected(o.category)}
                  data-testid={`ride-option-${o.category}`}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors duration-150 disabled:opacity-40 ${
                    on ? "bg-[#1A1E28]" : "hover:bg-[#161A22]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[14px] font-semibold text-white">
                      {o.label}
                      <span className="flex items-center gap-0.5 text-[10px] font-normal text-[#7E8698]">
                        <Users size={10} /> {o.seats}
                      </span>
                      {o.surge_multiplier > 1 ? (
                        <span className="rounded bg-[#2B1114] px-1.5 py-0.5 text-[9px] font-bold text-[#FF6B6B]">
                          {o.surge_multiplier}× SURGE
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#8E95A5]" data-testid={`ride-option-eta-${o.category}`}>
                      {o.available
                        ? o.eta_min
                          ? `${o.eta_min} min away · ${o.duration_min} min trip`
                          : `No partner nearby · ${o.duration_min} min trip`
                        : o.unavailable_reason}
                    </p>
                  </div>
                  <p
                    className="wl-mono shrink-0 text-[15px] font-semibold text-[#F5D061]"
                    data-testid={`ride-option-fare-${o.category}`}
                  >
                    {inr2(o.total)}
                  </p>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="space-y-3 border-t border-[#232834] p-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[#9BA1B0]">
                  PAYMENT METHOD
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.v}
                      type="button"
                      onClick={() => setPayment(m.v)}
                      data-testid={`payment-${m.v}`}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors duration-150 ${
                        payment === m.v
                          ? "border-[#634E1D] bg-[#2A2312] font-semibold text-[#F5D061]"
                          : "border-[#2A303F] text-[#9BA1B0] hover:text-white"
                      }`}
                    >
                      {m.l}
                    </button>
                  ))}
                </div>
              </div>

              <input
                value={promo}
                onChange={(e) => setPromo(e.target.value.toUpperCase())}
                placeholder="Promo code (optional)"
                data-testid="promo-input"
                className="wl-mono w-full rounded-xl border border-[#2A303F] bg-[#0D0F14] px-3.5 py-2.5 text-[13px] text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
              />

              <button
                type="button"
                disabled={book.isPending}
                onClick={() => {
                  const opt = options.find((o) => o.category === selected);
                  if (opt) book.mutate(opt);
                }}
                data-testid="request-ride-button"
                className="w-full rounded-xl bg-[#D4AF37] py-3.5 text-[15px] font-semibold text-[#0B0C10] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-50"
              >
                {book.isPending
                  ? "Requesting…"
                  : `Request ${options.find((o) => o.category === selected)?.label}`}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
