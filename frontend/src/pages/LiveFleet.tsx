import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { apiGet } from "@/lib/api";
import { EmptyState, MetricCard, PanelCard } from "@/components/common/MetricCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { FleetSnapshot } from "@/lib/types";
import { inr, titleize } from "@/lib/types";

const KOLKATA: [number, number] = [22.5726, 88.3639];

export default function LiveFleet() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const { data, isError } = useQuery({
    queryKey: ["fleet"],
    queryFn: () => apiGet<FleetSnapshot>("/fleet/live"),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView(KOLKATA, 12);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !data) return;
    layer.clearLayers();
    data.drivers.forEach((d) => {
      const color = d.on_trip ? "#D4AF37" : "#10B981";
      L.circleMarker([d.lat, d.lng], {
        radius: 6,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 2,
      })
        .bindPopup(
          `<strong>${d.name}</strong><br/>${d.vehicle_number} · ${titleize(d.category)}<br/>${
            d.on_trip ? "On trip" : "Idle"
          } · ★ ${d.rating}<br/>${d.zone}`,
        )
        .addTo(layer);
    });
  }, [data]);

  return (
    <div className="space-y-6">
      <div>
        <p className="wl-overline">Real-time dispatch</p>
        <h1 className="mt-1.5 text-[30px] font-bold tracking-tight text-white">Live Fleet Map</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard testId="fleet-online-count" label="Drivers online" value={data ? String(data.online_count) : "—"} />
        <MetricCard
          testId="fleet-ontrip-count"
          label="On trip"
          value={data ? String(data.on_trip_count) : "—"}
          accent="#10B981"
        />
        <MetricCard
          testId="fleet-live-trips-count"
          label="Live trips"
          value={data ? String(data.live_trips.length) : "—"}
          accent="#3B82F6"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="overflow-hidden rounded-xl border border-[#232834] lg:col-span-8">
          <div className="flex items-center justify-between border-b border-[#232834] bg-[#11141A] px-5 py-3">
            <h2 className="text-sm font-semibold text-white">Kolkata fleet positions</h2>
            <div className="flex items-center gap-4 text-[11px] text-[#8E95A5]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#10B981]" /> Idle
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#D4AF37]" /> On trip
              </span>
            </div>
          </div>
          <div ref={mapEl} data-testid="fleet-map" className="h-[600px] w-full bg-[#0A0C10]" />
        </div>

        <PanelCard testId="live-trips-panel" title="Active trip monitor" className="lg:col-span-4">
          <div className="max-h-[640px] divide-y divide-[#232834] overflow-y-auto">
            {isError || !data || data.live_trips.length === 0 ? (
              <EmptyState message="No trips are currently in flight." testId="live-trips-empty" />
            ) : (
              data.live_trips.map((t) => (
                <div key={t.id} data-testid={`live-trip-${t.code}`} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="wl-mono text-[12px] font-medium text-[#F5D061]">{t.code}</span>
                    <StatusBadge state={t.state} />
                  </div>
                  <p className="mt-2 text-[13px] text-white">
                    {t.pickup} <span className="text-[#5E6575]">→</span> {t.drop}
                  </p>
                  <p className="mt-1 text-[11px] text-[#8E95A5]">
                    {t.rider_name} · {t.driver_name ?? "Unassigned"} · {titleize(t.category)}
                  </p>
                  <p className="wl-mono mt-1 text-[11px] text-[#C5A25D]">{inr(t.fare_total)}</p>
                </div>
              ))
            )}
          </div>
        </PanelCard>
      </div>
    </div>
  );
}
