import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { apiGet } from "@/lib/api";
import type { MapsConfig } from "@/rider/lib/riderTypes";

const FALLBACK_TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function dot(color: string, size = 16, pulse = false) {
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;
      background:${color};border:2.5px solid #0B0C10;box-shadow:0 0 0 3px ${color}44;
      ${pulse ? "animation:wl-beacon 1.6s ease-out infinite;" : ""}"></span>`,
  });
}

/** Live trip map: pickup, drop and the driver marker that moves between them. */
export default function TripMap({
  pickup,
  drop,
  driver,
  inProgress,
}: {
  pickup: [number, number];
  drop: [number, number] | null;
  driver: [number, number] | null;
  inProgress: boolean;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const driverMarker = useRef<L.Marker | null>(null);

  // The tile source comes from the backend, so switching to Ola/Mappls needs no client change.
  const { data: cfg } = useQuery({
    queryKey: ["maps-config"],
    queryFn: () => apiGet<MapsConfig>("/rider/maps-config"),
    staleTime: 5 * 60 * 1000,
  });

  const tiles = useRef<L.TileLayer | null>(null);
  const initial = useRef<[number, number]>(pickup);

  // Create the map exactly once — array props are fresh references on every
  // render, so keying this effect on them would tear the map down mid-frame.
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(
      initial.current,
      14,
    );
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
      tiles.current = null;
      driverMarker.current = null;
    };
  }, []);

  // Tile source arrives from the backend, so swap the layer in when it lands.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    tiles.current?.remove();
    tiles.current = L.tileLayer(cfg?.tile_url || FALLBACK_TILE, {
      attribution: cfg?.attribution || "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(m);
  }, [cfg?.tile_url, cfg?.attribution]);

  useEffect(() => {
    const m = map.current;
    const lg = layer.current;
    if (!m || !lg) return;
    lg.clearLayers();
    driverMarker.current = null;

    L.marker(pickup, { icon: dot("#34D399") }).bindPopup("Pickup").addTo(lg);
    if (drop) L.marker(drop, { icon: dot("#F5D061") }).bindPopup("Drop").addTo(lg);
    if (drop) {
      L.polyline([pickup, drop], {
        color: "#D4AF37",
        weight: 2,
        opacity: 0.45,
        dashArray: "6 8",
      }).addTo(lg);
    }

    if (driver) {
      driverMarker.current = L.marker(driver, { icon: dot("#3B82F6", 18, true) })
        .bindPopup("Your driver")
        .addTo(lg);
      L.polyline([driver, inProgress && drop ? drop : pickup], {
        color: "#3B82F6",
        weight: 3,
        opacity: 0.75,
      }).addTo(lg);
    }

    const pts: [number, number][] = [pickup, ...(drop ? [drop] : []), ...(driver ? [driver] : [])];
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.28));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup.join(), drop?.join(), driver?.join(), inProgress]);

  return (
    <div
      ref={el}
      data-testid="trip-map"
      className="h-[240px] w-full overflow-hidden rounded-2xl border border-[#232834] bg-[#0A0C10]"
    />
  );
}
