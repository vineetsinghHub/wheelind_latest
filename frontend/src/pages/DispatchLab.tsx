import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Calculator, Crosshair, MoonStar, Radar } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiPost } from "@/lib/api";
import { EmptyState, MetricCard, PanelCard } from "@/components/common/MetricCard";
import type { NearbySearch, QuoteResponse } from "@/lib/types";
import { KOLKATA_ZONES, SERVICE_CATEGORIES, inr2, titleize } from "@/lib/types";

function errMsg(e: unknown, fallback: string) {
  if (e instanceof ApiError && e.body && typeof e.body === "object") {
    const d = (e.body as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

const NIGHT_MODES = [
  { v: "auto", l: "Auto (server IST clock)" },
  { v: "on", l: "Force night charge" },
  { v: "off", l: "Force day rates" },
];

export default function DispatchLab() {
  const [category, setCategory] = useState("cab");
  const [zoneIdx, setZoneIdx] = useState(0);
  const [radiusKm, setRadiusKm] = useState(8);
  const [matchCategory, setMatchCategory] = useState(true);
  const [form, setForm] = useState({
    distance_km: "8",
    duration_min: "24",
    waiting_min: "0",
    surge_multiplier: "1",
    rider_added_fare: "0",
    toll_parking: "0",
    discount: "0",
  });
  const [nightMode, setNightMode] = useState("auto");
  const [zeroCommission, setZeroCommission] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);

  const zone = KOLKATA_ZONES[zoneIdx];

  const nearbyParams = new URLSearchParams({
    lat: String(zone.lat),
    lng: String(zone.lng),
    radius_km: String(radiusKm),
    limit: "15",
  });
  if (matchCategory) nearbyParams.set("category", category);

  const { data: nearby, isError: nearbyError } = useQuery({
    queryKey: ["nearby", zone.name, radiusKm, matchCategory ? category : "all"],
    queryFn: () => apiGet<NearbySearch>(`/dispatch/nearby-drivers?${nearbyParams.toString()}`),
  });

  const runQuote = useMutation({
    mutationFn: () =>
      apiPost<QuoteResponse>("/pricing/quote", {
        category,
        distance_km: Number(form.distance_km),
        duration_min: Number(form.duration_min),
        waiting_min: Number(form.waiting_min || 0),
        surge_multiplier: Number(form.surge_multiplier || 1),
        rider_added_fare: Number(form.rider_added_fare || 0),
        toll_parking: Number(form.toll_parking || 0),
        discount: Number(form.discount || 0),
        zero_commission: zeroCommission,
        night: nightMode === "auto" ? null : nightMode === "on",
      }),
    onSuccess: (q) => {
      setQuote(q);
      toast.success(`Quoted ${inr2(q.breakup.total)} on ${titleize(q.category)} v${q.config_version}`);
    },
    onError: (e) => {
      setQuote(null);
      toast.error(errMsg(e, "Quote failed"));
    },
  });

  // ---- map ----
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current).setView([zone.lat, zone.lng], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [zone.lat, zone.lng]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    map.setView([zone.lat, zone.lng], radiusKm > 8 ? 12 : 13);

    // pickup pin + search radius
    L.circleMarker([zone.lat, zone.lng], {
      radius: 8,
      color: "#D4AF37",
      fillColor: "#D4AF37",
      fillOpacity: 1,
      weight: 2,
    })
      .bindPopup(`<strong>Pickup</strong><br/>${zone.name}`)
      .addTo(layer);
    L.circle([zone.lat, zone.lng], {
      radius: radiusKm * 1000,
      color: "#D4AF37",
      weight: 1,
      fillColor: "#D4AF37",
      fillOpacity: 0.06,
      dashArray: "5 6",
    }).addTo(layer);

    (nearby?.drivers ?? []).forEach((d, i) => {
      const color = i === 0 ? "#10B981" : "#3B82F6";
      L.circleMarker([d.lat, d.lng], {
        radius: i === 0 ? 7 : 5,
        color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2,
      })
        .bindPopup(
          `<strong>${d.name}</strong><br/>${d.vehicle_number} · ${titleize(d.category)}<br/>${d.distance_km} km · ETA ${d.eta_min} min<br/>★ ${d.rating}`,
        )
        .addTo(layer);
      L.polyline(
        [
          [zone.lat, zone.lng],
          [d.lat, d.lng],
        ],
        { color, weight: i === 0 ? 2 : 1, opacity: i === 0 ? 0.7 : 0.25 },
      ).addTo(layer);
    });
  }, [nearby, zone, radiusKm]);

  const rows: [string, number][] = quote
    ? [
        ["Base fare", quote.breakup.base_fare],
        ["Distance charge", quote.breakup.distance_charge],
        ["Time charge", quote.breakup.time_charge],
        ["Waiting charge", quote.breakup.waiting_charge],
        ["Surge amount", quote.breakup.surge_amount],
        ["Night charge", quote.breakup.night_charge],
        ["Rider added fare", quote.breakup.rider_added_fare],
        ["Discount", -quote.breakup.discount],
        [`Tax / GST (${quote.tax_pct}%)`, quote.breakup.tax],
        ["Toll & parking", quote.breakup.toll_parking],
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <p className="wl-overline">Pricing engine &amp; geospatial dispatch</p>
        <h1 className="mt-1.5 text-[30px] font-bold tracking-tight text-white">Dispatch Lab</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#8E95A5]">
          Price any trip against the live fare config, and see which online partners a
          nearest-driver lookup would actually reach. Same engine a rider quote and a support
          fare dispute would use.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          testId="dispatch-eligible-count"
          label="Eligible in radius"
          value={nearby ? String(nearby.eligible) : "—"}
          sub={`within ${radiusKm} km of ${zone.name}`}
          icon={<Radar size={16} />}
        />
        <MetricCard
          testId="dispatch-considered-count"
          label="Eligible fleet-wide"
          value={nearby ? String(nearby.considered) : "—"}
          sub={matchCategory ? `online ${titleize(category)} partners` : "online, any service"}
          icon={<Crosshair size={16} />}
          accent="#3B82F6"
        />
        <MetricCard
          testId="dispatch-nearest-eta"
          label="Nearest ETA"
          value={nearby && nearby.drivers.length > 0 ? `${nearby.drivers[0].eta_min} min` : "—"}
          sub={nearby && nearby.drivers.length > 0 ? `${nearby.drivers[0].distance_km} km away` : "no partner in range"}
          accent="#10B981"
        />
        <MetricCard
          testId="dispatch-quote-total"
          label="Quoted fare"
          value={quote ? inr2(quote.breakup.total) : "—"}
          sub={quote ? `driver keeps ${inr2(quote.driver_earning)}` : "run a quote"}
          icon={<Calculator size={16} />}
          accent="#F59E0B"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <PanelCard title="Trip inputs" className="lg:col-span-4" testId="quote-form-panel">
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              runQuote.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Service</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  data-testid="quote-category-select"
                  className="w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
                >
                  {SERVICE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {titleize(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Pickup zone</label>
                <select
                  value={zoneIdx}
                  onChange={(e) => setZoneIdx(Number(e.target.value))}
                  data-testid="quote-zone-select"
                  className="w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
                >
                  {KOLKATA_ZONES.map((z, i) => (
                    <option key={z.name} value={i}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["distance_km", "Distance (km)"],
                  ["duration_min", "Duration (min)"],
                  ["waiting_min", "Waiting (min)"],
                  ["surge_multiplier", "Surge (x)"],
                  ["rider_added_fare", "Rider added (₹)"],
                  ["toll_parking", "Toll/parking (₹)"],
                  ["discount", "Promo discount (₹)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">{label}</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    data-testid={`quote-input-${key}`}
                    className="wl-mono w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
                  />
                </div>
              ))}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">Night charge</label>
                <select
                  value={nightMode}
                  onChange={(e) => setNightMode(e.target.value)}
                  data-testid="quote-night-select"
                  className="w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
                >
                  {NIGHT_MODES.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#C2C7D4]">
              <input
                type="checkbox"
                checked={zeroCommission}
                onChange={(e) => setZeroCommission(e.target.checked)}
                data-testid="quote-zerocommission-toggle"
                className="h-4 w-4 accent-[#D4AF37]"
              />
              Driver holds a zero-commission pass
            </label>

            <button
              type="submit"
              disabled={runQuote.isPending}
              data-testid="quote-submit-button"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2.5 text-sm font-semibold text-[#090A0C] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-60"
            >
              <Calculator size={15} />
              {runQuote.isPending ? "Calculating…" : "Calculate fare"}
            </button>

            <div className="border-t border-[#232834] pt-4">
              <label className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">
                Search radius — {radiusKm} km
              </label>
              <input
                type="range"
                min="1"
                max="25"
                step="1"
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                data-testid="dispatch-radius-slider"
                className="w-full accent-[#D4AF37]"
              />
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-[#C2C7D4]">
                <input
                  type="checkbox"
                  checked={matchCategory}
                  onChange={(e) => setMatchCategory(e.target.checked)}
                  data-testid="dispatch-matchcategory-toggle"
                  className="h-4 w-4 accent-[#D4AF37]"
                />
                Only match the selected service
              </label>
            </div>
          </form>
        </PanelCard>

        <PanelCard
          title="Fare breakup"
          className="lg:col-span-4"
          testId="quote-result-panel"
          action={
            quote ? (
              <span className="wl-mono text-[11px] text-[#7E8698]">
                config v{quote.config_version} · cap {quote.surge_cap}x
              </span>
            ) : null
          }
        >
          {!quote ? (
            <EmptyState
              message="Run a quote to see the itemised fare, commission split and driver payout."
              testId="quote-empty"
            />
          ) : (
            <div className="p-5">
              <dl className="space-y-1.5 text-[12px]">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt className="text-[#8E95A5]">{k}</dt>
                    <dd className="wl-mono text-[#C2C7D4]">{inr2(v)}</dd>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t border-[#2E3547] pt-2">
                  <dt className="font-semibold text-white">Rider pays</dt>
                  <dd className="wl-mono font-semibold text-[#F5D061]" data-testid="quote-total">
                    {inr2(quote.breakup.total)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#8E95A5]">
                    Platform commission{quote.zero_commission ? " (pass active)" : ` (${quote.commission_pct}%)`}
                  </dt>
                  <dd className="wl-mono text-[#C2C7D4]" data-testid="quote-commission">
                    {inr2(quote.commission)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#8E95A5]">Driver earning</dt>
                  <dd className="wl-mono font-semibold text-[#34D399]" data-testid="quote-driver-earning">
                    {inr2(quote.driver_earning)}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {quote.minimum_fare_applied ? (
                  <span
                    data-testid="quote-minimum-applied"
                    className="rounded-md border border-[#634E1D] bg-[#2A2312] px-2 py-0.5 text-[10px] font-semibold text-[#F5D061]"
                  >
                    Minimum fare floor applied
                  </span>
                ) : null}
                {quote.night_charge_applied ? (
                  <span
                    data-testid="quote-night-applied"
                    className="flex items-center gap-1 rounded-md border border-[#3B3172] bg-[#1B1830] px-2 py-0.5 text-[10px] font-semibold text-[#A78BFA]"
                  >
                    <MoonStar size={10} /> Night charge applied
                  </span>
                ) : null}
                {quote.zero_commission ? (
                  <span
                    data-testid="quote-zerocommission-applied"
                    className="rounded-md border border-[#064E3B] bg-[#0D241A] px-2 py-0.5 text-[10px] font-semibold text-[#34D399]"
                  >
                    Zero commission
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </PanelCard>

        <PanelCard
          title="Nearest eligible partners"
          className="lg:col-span-4"
          testId="nearby-panel"
          action={<span className="text-[11px] text-[#7E8698]">2dsphere · closest first</span>}
        >
          <div className="max-h-[520px] divide-y divide-[#1E222B] overflow-y-auto">
            {nearbyError || !nearby || nearby.drivers.length === 0 ? (
              <EmptyState
                message={`No online ${matchCategory ? titleize(category) : ""} partner within ${radiusKm} km. Widen the radius.`}
                testId="nearby-empty"
              />
            ) : (
              nearby.drivers.map((d, i) => (
                <div
                  key={d.id}
                  data-testid={`nearby-driver-${d.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[13px] text-white">
                      {i === 0 ? (
                        <span className="rounded bg-[#0D241A] px-1.5 py-0.5 text-[9px] font-bold text-[#34D399]">
                          NEAREST
                        </span>
                      ) : null}
                      {d.name}
                    </p>
                    <p className="wl-mono text-[11px] text-[#7E8698]">
                      {d.vehicle_number} · {titleize(d.category)} · ★ {d.rating}
                    </p>
                    <p className="text-[10px] text-[#5E6575]">
                      {d.zone}
                      {d.commission_model === "subscription" ? " · zero-comm pass" : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="wl-mono text-[13px] font-semibold text-[#F5D061]">{d.distance_km} km</p>
                    <p className="wl-mono text-[11px] text-[#8E95A5]">ETA {d.eta_min}m</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </PanelCard>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#232834]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232834] bg-[#11141A] px-5 py-3">
          <h2 className="text-sm font-semibold text-white">
            Match radius — {zone.name} · {radiusKm} km
          </h2>
          <div className="flex items-center gap-4 text-[11px] text-[#8E95A5]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#D4AF37]" /> Pickup
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#10B981]" /> Nearest
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#3B82F6]" /> Other candidates
            </span>
          </div>
        </div>
        <div ref={mapEl} data-testid="dispatch-map" className="h-[480px] w-full bg-[#0A0C10]" />
      </div>
    </div>
  );
}
