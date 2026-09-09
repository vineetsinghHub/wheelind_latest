import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, BadgeIndianRupee, CalendarClock, CarFront, IdCard, Radio, Users } from "lucide-react";

import { apiGet } from "@/lib/api";
import { EmptyState, MetricCard, PanelCard } from "@/components/common/MetricCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { DashboardStats, DocumentAlert, SosIncident } from "@/lib/types";
import { expiryLabel, inr, titleize } from "@/lib/types";

const PIE_COLORS = ["#D4AF37", "#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#F97316", "#64748B"];

export default function Dashboard() {
  const { data: stats, isError } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<DashboardStats>("/dashboard/stats"),
    refetchInterval: 30000,
  });

  const { data: sos } = useQuery({
    queryKey: ["sos", "open"],
    queryFn: () => apiGet<SosIncident[]>("/sos?status=open"),
    refetchInterval: 30000,
  });

  const { data: alerts } = useQuery({
    queryKey: ["document-alerts"],
    queryFn: () => apiGet<DocumentAlert[]>("/drivers/document-alerts"),
    refetchInterval: 60000,
  });

  const offline = isError || !stats;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="wl-overline">Kolkata Operations · Last 24 hours</p>
          <h1 className="mt-1.5 text-[30px] font-bold tracking-tight text-white">Dashboard</h1>
        </div>
        <Link
          to="/admin/fleet"
          data-testid="dashboard-open-fleet-link"
          className="flex items-center gap-2 rounded-lg border border-[#2A303F] bg-[#11141A] px-4 py-2 text-[13px] text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/50 hover:text-white"
        >
          <Radio size={15} />
          Open live fleet map
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        <MetricCard
          testId="metric-rides-today"
          label="Rides · 24h"
          value={offline ? "—" : String(stats.rides_today)}
          sub={offline ? "Awaiting data" : `${stats.live_rides} currently live`}
          icon={<CarFront size={16} />}
        />
        <MetricCard
          testId="metric-revenue-today"
          label="Revenue · 24h"
          value={offline ? "—" : inr(stats.revenue_today)}
          sub={offline ? "Awaiting data" : `${stats.completion_rate}% completion rate`}
          icon={<BadgeIndianRupee size={16} />}
          accent="#10B981"
        />
        <MetricCard
          testId="metric-online-drivers"
          label="Drivers online"
          value={offline ? "—" : String(stats.online_drivers)}
          sub={offline ? "Awaiting data" : `${stats.active_drivers} KYC-approved partners`}
          icon={<Users size={16} />}
          accent="#3B82F6"
        />
        <MetricCard
          testId="metric-open-sos"
          label="Open SOS"
          value={offline ? "—" : String(stats.open_sos)}
          sub={offline ? "Awaiting data" : `${stats.pending_kyc} KYC files pending review`}
          icon={<AlertTriangle size={16} />}
          accent="#EF4444"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <PanelCard
          testId="hourly-rides-panel"
          title="Hourly ride volume"
          className="lg:col-span-8"
          action={<span className="text-[11px] text-[#7E8698]">Rides created per hour</span>}
        >
          <div className="h-[300px] p-4">
            {offline ? (
              <EmptyState message="Live ride volume appears once the operations API is reachable." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.hourly_rides}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232834" vertical={false} />
                  <XAxis dataKey="label" stroke="#7E8698" fontSize={10} tickLine={false} interval={2} />
                  <YAxis stroke="#7E8698" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "#ffffff08" }}
                    contentStyle={{
                      background: "#12151D", border: "1px solid #2E3547", borderRadius: 8, fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" fill="#D4AF37" radius={[3, 3, 0, 0]} name="Rides" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </PanelCard>

        <PanelCard testId="sos-queue-panel" title="Open SOS queue" className="lg:col-span-4">
          <div className="max-h-[300px] divide-y divide-[#232834] overflow-y-auto">
            {!sos || sos.length === 0 ? (
              <EmptyState message="No open SOS incidents right now." testId="sos-queue-empty" />
            ) : (
              sos.slice(0, 6).map((s) => (
                <Link
                  key={s.id}
                  to="/admin/sos"
                  data-testid={`sos-queue-item-${s.id}`}
                  className="block px-5 py-3.5 transition-colors duration-150 hover:bg-[#161A22]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] font-medium text-white">{s.reason}</p>
                    <span className="wl-mono shrink-0 text-[11px] text-[#FF6B6B]">
                      {s.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="wl-mono mt-1 text-[11px] text-[#8E95A5]">
                    {s.ride_code} · {s.location_label}
                  </p>
                </Link>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard testId="category-split-panel" title="Revenue by service" className="lg:col-span-5">
          <div className="h-[280px] p-4">
            {offline || stats.category_split.length === 0 ? (
              <EmptyState message="Service mix appears once rides are recorded." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.category_split}
                    dataKey="revenue"
                    nameKey="category"
                    innerRadius={58}
                    outerRadius={95}
                    paddingAngle={2}
                    stroke="#0D0F14"
                  >
                    {stats.category_split.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => inr(Number(v ?? 0))}
                    contentStyle={{
                      background: "#12151D", border: "1px solid #2E3547", borderRadius: 8, fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </PanelCard>

        <PanelCard testId="state-breakdown-panel" title="Ride lifecycle breakdown" className="lg:col-span-7">
          <div className="max-h-[280px] overflow-y-auto p-4">
            {offline || stats.state_breakdown.length === 0 ? (
              <EmptyState message="Lifecycle distribution appears once rides are recorded." />
            ) : (
              <ul className="space-y-2.5">
                {stats.state_breakdown.map((s) => {
                  const max = Math.max(...stats.state_breakdown.map((x) => x.value), 1);
                  return (
                    <li key={s.label} data-testid={`state-row-${s.label}`} className="flex items-center gap-3">
                      <div className="w-40 shrink-0">
                        <StatusBadge state={s.label} />
                      </div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#1D2330]">
                        <div
                          className="h-full rounded-full bg-[#D4AF37] transition-[width] duration-500"
                          style={{ width: `${(s.value / max) * 100}%` }}
                        />
                      </div>
                      <span className="wl-mono w-10 text-right text-xs text-white">{s.value}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </PanelCard>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          testId="metric-total-riders"
          label="Registered riders"
          value={offline ? "—" : String(stats.total_riders)}
          icon={<Users size={16} />}
          accent="#8B5CF6"
        />
        <MetricCard
          testId="metric-cancellation-rate"
          label="Cancellation rate"
          value={offline ? "—" : `${stats.cancellation_rate}%`}
          icon={<AlertTriangle size={16} />}
          accent="#F59E0B"
        />
        <MetricCard
          testId="metric-pending-kyc"
          label="KYC pending"
          value={offline ? "—" : String(stats.pending_kyc)}
          sub={offline ? undefined : titleize("awaiting_document_review")}
          icon={<IdCard size={16} />}
          accent="#F97316"
        />
        <MetricCard
          testId="metric-expiring-documents"
          label="Docs need renewal"
          value={offline ? "—" : String(stats.expiring_documents + stats.expired_documents)}
          sub={
            offline
              ? undefined
              : `${stats.expired_documents} expired · ${stats.expiring_documents} within 30 days · ${stats.resubmitted_documents} re-submitted`
          }
          icon={<CalendarClock size={16} />}
          accent="#EF4444"
        />
      </div>

      <PanelCard
        testId="document-alerts-panel"
        title="Document renewal alerts"
        action={
          <Link
            to="/admin/drivers"
            data-testid="document-alerts-review-link"
            className="text-[11px] text-[#F5D061] transition-colors duration-150 hover:text-[#E5C158]"
          >
            Review in Drivers &amp; KYC →
          </Link>
        }
      >
        <div className="max-h-[340px] overflow-y-auto">
          {!alerts || alerts.length === 0 ? (
            <EmptyState
              message="No licence or insurance papers are expiring in the next 30 days."
              testId="document-alerts-empty"
            />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[#232834] text-[11px] tracking-wider text-[#7E8698] uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Partner</th>
                  <th className="px-5 py-3 font-semibold">Document</th>
                  <th className="px-5 py-3 font-semibold">Vehicle</th>
                  <th className="px-5 py-3 font-semibold">Zone</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E222B]">
                {alerts.slice(0, 25).map((a) => (
                  <tr
                    key={`${a.driver_id}-${a.doc_type}`}
                    data-testid={`document-alert-row-${a.driver_id}-${a.doc_type.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                    className="transition-colors duration-150 hover:bg-[#161A22]"
                  >
                    <td className="px-5 py-3 text-white">
                      {a.driver_name}
                      <span className="wl-mono block text-[11px] text-[#7E8698]">{a.phone}</span>
                    </td>
                    <td className="px-5 py-3 text-[#C2C7D4]">
                      {a.doc_type}
                      <span className="wl-mono block text-[11px] text-[#7E8698]">{a.number}</span>
                    </td>
                    <td className="wl-mono px-5 py-3 text-[11px] text-[#C2C7D4]">{a.vehicle_number}</td>
                    <td className="px-5 py-3 text-[#C2C7D4]">{a.zone}</td>
                    <td className="px-5 py-3">
                      <span
                        className="inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
                        style={{
                          color: a.expiry_status === "expired" ? "#FF6B6B" : "#F59E0B",
                          borderColor: a.expiry_status === "expired" ? "#7F1D1D" : "#634E1D",
                          backgroundColor: a.expiry_status === "expired" ? "#2B1114" : "#2A2312",
                        }}
                      >
                        {expiryLabel(a.days_to_expiry)}
                      </span>
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
