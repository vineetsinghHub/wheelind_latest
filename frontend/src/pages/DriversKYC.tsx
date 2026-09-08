import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Eye } from "lucide-react";

import { ApiError, apiGet, apiPatch } from "@/lib/api";
import { EmptyState, PanelCard } from "@/components/common/MetricCard";
import { ExpiryBadge, ToneBadge } from "@/components/common/StatusBadge";
import type { Driver, DriverDocument } from "@/lib/types";
import { SERVICE_CATEGORIES, fmtDate, fmtDateTime, inr, titleize } from "@/lib/types";

function errMsg(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.body && typeof err.body === "object") {
    const d = (err.body as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

export default function DriversKYC() {
  const qc = useQueryClient();
  const [kyc, setKyc] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [docAlert, setDocAlert] = useState("");
  const [selected, setSelected] = useState<Driver | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DriverDocument | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingType, setRejectingType] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (kyc) params.set("kyc_status", kyc);
  if (category) params.set("category", category);
  if (q) params.set("q", q);
  if (docAlert) params.set("doc_alert", docAlert);
  const qs = params.toString();

  const { data: drivers, isError } = useQuery({
    queryKey: ["drivers", kyc, category, q, docAlert],
    queryFn: () => apiGet<Driver[]>(`/drivers${qs ? `?${qs}` : ""}`),
  });

  // Keep the open drawer in sync with refetched data so badges update after a decision.
  const live = selected ? (drivers ?? []).find((d) => d.id === selected.id) ?? selected : null;

  const decideDoc = useMutation({
    mutationFn: (v: { id: string; docType: string; status: string; reason: string }) =>
      apiPatch<Driver>(`/drivers/${v.id}/documents/${encodeURIComponent(v.docType)}`, {
        status: v.status,
        reason: v.reason,
      }),
    onSuccess: (d, v) => {
      toast.success(`${v.docType} ${v.status} — KYC file now ${titleize(d.kyc_status)}`);
      setSelected(d);
      setRejectingType(null);
      setRejectReason("");
      setViewingDoc(d.documents.find((x) => x.type === v.docType) ?? null);
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["document-alerts"] });
    },
    onError: (e) => toast.error(errMsg(e, "Document decision failed")),
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      apiPatch<Driver>(`/drivers/${v.id}/kyc`, { status: v.status, note: "Reviewed in admin portal" }),
    onSuccess: (d) => {
      toast.success(`${d.name} — KYC ${titleize(d.kyc_status)}`);
      setSelected(d);
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(errMsg(e, "KYC update failed")),
  });

  const toggleOnline = useMutation({
    mutationFn: (v: { id: string; is_online: boolean }) =>
      apiPatch<Driver>(`/drivers/${v.id}/online`, { is_online: v.is_online }),
    onSuccess: (d) => {
      toast.success(`${d.name} is now ${d.is_online ? "online" : "offline"}`);
      setSelected(d);
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["fleet"] });
    },
    onError: (e) => toast.error(errMsg(e, "Availability update failed")),
  });

  const list = drivers ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="wl-overline">Partner onboarding & compliance</p>
          <h1 className="mt-1.5 text-[30px] font-bold tracking-tight text-white">Drivers & KYC</h1>
        </div>
        <span className="wl-mono text-xs text-[#8E95A5]" data-testid="drivers-total-count">
          {list.length} partners
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone or vehicle number"
          data-testid="drivers-search-input"
          className="min-w-[260px] flex-1 rounded-lg border border-[#2A303F] bg-[#11141A] px-3.5 py-2 text-sm text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
        />
        <select
          value={kyc}
          onChange={(e) => setKyc(e.target.value)}
          data-testid="drivers-kyc-filter"
          className="rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
        >
          <option value="">All KYC states</option>
          {["pending", "approved", "action_required", "rejected"].map((s) => (
            <option key={s} value={s}>
              {titleize(s)}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          data-testid="drivers-category-filter"
          className="rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
        >
          <option value="">All services</option>
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {titleize(c)}
            </option>
          ))}
        </select>
        <select
          value={docAlert}
          onChange={(e) => setDocAlert(e.target.value)}
          data-testid="drivers-docalert-filter"
          className="rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
        >
          <option value="">All document states</option>
          <option value="any">Needs renewal (any)</option>
          <option value="expiring_soon">Expiring within 30 days</option>
          <option value="expired">Already expired</option>
        </select>
      </div>

      <PanelCard title="Partner roster" testId="drivers-table-panel">
        <div className="overflow-x-auto">
          {isError || list.length === 0 ? (
            <EmptyState message="No drivers match these filters." testId="drivers-empty" />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-[#232834] text-[11px] tracking-wider text-[#7E8698] uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Partner</th>
                  <th className="px-5 py-3 font-semibold">Vehicle</th>
                  <th className="px-5 py-3 font-semibold">Zone</th>
                  <th className="px-5 py-3 font-semibold">KYC</th>
                  <th className="px-5 py-3 font-semibold">Availability</th>
                  <th className="px-5 py-3 font-semibold">Model</th>
                  <th className="px-5 py-3 text-right font-semibold">Lifetime</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E222B]">
                {list.map((d) => (
                  <tr key={d.id} data-testid={`driver-row-${d.id}`} className="transition-colors duration-150 hover:bg-[#161A22]">
                    <td className="px-5 py-3 text-white">
                      {d.name}
                      <span className="wl-mono block text-[11px] text-[#7E8698]">{d.phone} · ★ {d.rating}</span>
                    </td>
                    <td className="px-5 py-3 text-[#C2C7D4]">
                      {d.vehicle_model}
                      <span className="wl-mono block text-[11px] text-[#7E8698]">{d.vehicle_number}</span>
                    </td>
                    <td className="px-5 py-3 text-[#C2C7D4]">
                      {d.zone}
                      <span className="block text-[11px] text-[#7E8698]">{titleize(d.category)}</span>
                    </td>
                    <td className="px-5 py-3">
                      <ToneBadge value={d.kyc_status} testId={`driver-kyc-${d.id}`} />
                      {d.flags.length > 0 ? (
                        <span className="mt-1 block text-[10px] text-[#FF6B6B]">
                          {d.flags.map(titleize).join(", ")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-1.5 text-[12px] text-[#C2C7D4]">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: d.is_online ? "#10B981" : "#6B7280" }}
                        />
                        {d.is_online ? (d.on_trip ? "On trip" : "Online") : "Offline"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#C2C7D4]">
                      {d.commission_model === "subscription" ? "Zero-comm pass" : "Commission"}
                    </td>
                    <td className="wl-mono px-5 py-3 text-right text-white">{inr(d.lifetime_earnings)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelected(d)}
                        data-testid={`driver-review-${d.id}`}
                        className="rounded-md border border-[#2A303F] px-2.5 py-1 text-[11px] text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PanelCard>

      {live ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setSelected(null)}>
          <div
            data-testid="driver-detail-drawer"
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-md overflow-y-auto border-l border-[#2E3547] bg-[#12151D] p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="wl-overline">KYC review</p>
                <h2 className="mt-1 text-xl font-bold text-white">{live.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                data-testid="driver-drawer-close"
                className="rounded-md border border-[#2A303F] px-2.5 py-1 text-xs text-[#9BA1B0] hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <ToneBadge value={live.kyc_status} testId="driver-drawer-kyc-status" />
            </div>

            <dl className="mt-5 space-y-2.5 text-[13px]">
              {[
                ["Phone", live.phone],
                ["Service", titleize(live.category)],
                ["Vehicle", `${live.vehicle_model} · ${live.vehicle_number}`],
                ["Zone", live.zone],
                ["Rating", `★ ${live.rating}`],
                ["Total rides", String(live.total_rides)],
                ["Lifetime earnings", inr(live.lifetime_earnings)],
                ["Monetization", live.commission_model === "subscription" ? "Zero-commission pass" : "Commission plan"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-[#1E222B] pb-2">
                  <dt className="text-[#8E95A5]">{k}</dt>
                  <dd className="wl-mono text-right text-white">{v}</dd>
                </div>
              ))}
            </dl>

            <p className="wl-overline mt-6">Uploaded documents</p>
            <ul className="mt-2 space-y-2">
              {live.documents.map((doc) => (
                <li
                  key={doc.type}
                  data-testid={`document-row-${doc.type.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                  className="rounded-lg border border-[#2A303F] bg-[#161A22] px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] text-white">{doc.type}</p>
                      <p className="wl-mono text-[11px] text-[#7E8698]">{doc.number}</p>
                      {doc.expires_on ? (
                        <p className="text-[10px] text-[#5E6575]">Valid till {fmtDate(doc.expires_on)}</p>
                      ) : doc.uploaded_at ? (
                        <p className="text-[10px] text-[#5E6575]">Uploaded {fmtDateTime(doc.uploaded_at)}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <div className="flex items-center gap-2">
                        <ToneBadge value={doc.status} />
                        <button
                          type="button"
                          onClick={() => setViewingDoc(doc)}
                          data-testid={`document-view-${doc.type.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                          className="flex items-center gap-1 rounded-md border border-[#2A303F] px-2 py-1 text-[11px] text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white"
                        >
                          <Eye size={12} />
                          View
                        </button>
                      </div>
                      <ExpiryBadge
                        status={doc.expiry_status}
                        days={doc.days_to_expiry}
                        testId={`document-expiry-${doc.type.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                      />
                    </div>
                  </div>
                  {doc.reject_reason ? (
                    <p
                      data-testid={`document-reason-${doc.type.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                      className="mt-2 rounded border border-[#7F1D1D] bg-[#2B1114] px-2 py-1 text-[11px] text-[#FF6B6B]"
                    >
                      Rejected: {doc.reject_reason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>

            <p className="wl-overline mt-6">Whole-file KYC decision</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["approved", "action_required", "rejected"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: live.id, status: s })}
                  data-testid={`driver-kyc-action-${s}`}
                  className="rounded-md border border-[#2A303F] px-2 py-2 text-[11px] font-semibold text-[#C2C7D4] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white disabled:opacity-40"
                >
                  {titleize(s)}
                </button>
              ))}
            </div>

            <p className="wl-overline mt-6">Availability override</p>
            <button
              type="button"
              disabled={toggleOnline.isPending}
              onClick={() => toggleOnline.mutate({ id: live.id, is_online: !live.is_online })}
              data-testid="driver-toggle-online"
              className="mt-2 w-full rounded-lg border border-[#2A303F] px-4 py-2 text-sm text-[#C2C7D4] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white disabled:opacity-40"
            >
              Force {live.is_online ? "offline" : "online"}
            </button>
          </div>
        </div>
      ) : null}

      {viewingDoc ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setViewingDoc(null)}
        >
          <div
            data-testid="document-viewer-modal"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#2E3547] bg-[#12151D]"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#232834] px-5 py-4">
              <div>
                <p className="wl-overline">Document preview</p>
                <h3 className="mt-1 text-lg font-semibold text-white" data-testid="document-viewer-title">
                  {viewingDoc.type}
                </h3>
                <p className="wl-mono mt-1 text-[11px] text-[#8E95A5]">
                  {viewingDoc.number}
                  {viewingDoc.uploaded_at ? ` · uploaded ${fmtDateTime(viewingDoc.uploaded_at)}` : ""}
                </p>
                {viewingDoc.expires_on ? (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] text-[#8E95A5]">
                      Valid till {fmtDate(viewingDoc.expires_on)}
                    </span>
                    <ExpiryBadge
                      status={viewingDoc.expiry_status}
                      days={viewingDoc.days_to_expiry}
                      testId="document-viewer-expiry"
                    />
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ToneBadge value={viewingDoc.status} testId="document-viewer-status" />
                <button
                  type="button"
                  onClick={() => setViewingDoc(null)}
                  data-testid="document-viewer-close"
                  className="rounded-md border border-[#2A303F] px-2.5 py-1 text-xs text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white"
                >
                  Close
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-auto bg-[#0A0C10] p-5">
              {viewingDoc.file_url ? (
                <img
                  src={viewingDoc.file_url}
                  alt={`${viewingDoc.type} scan`}
                  data-testid="document-viewer-image"
                  className="mx-auto max-h-[58vh] w-auto rounded-lg border border-[#232834] object-contain"
                />
              ) : (
                <p
                  data-testid="document-viewer-missing"
                  className="py-16 text-center text-sm text-[#8E95A5]"
                >
                  No scan was uploaded for this document.
                </p>
              )}
            </div>

            <footer className="space-y-3 border-t border-[#232834] px-5 py-3">
              {viewingDoc.reject_reason ? (
                <p
                  data-testid="document-viewer-reason"
                  className="rounded border border-[#7F1D1D] bg-[#2B1114] px-2.5 py-1.5 text-[11px] text-[#FF6B6B]"
                >
                  Rejected: {viewingDoc.reject_reason}
                </p>
              ) : null}

              {rejectingType === viewingDoc.type ? (
                <div className="space-y-2" data-testid="document-reject-form">
                  <label className="block text-[11px] font-medium text-[#9BA1B0]">
                    Why is this document being rejected?
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {["Blurred / unreadable scan", "Expired document", "Name mismatch", "Details do not match vehicle"].map(
                      (r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRejectReason(r)}
                          data-testid={`document-reject-preset-${r.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                          className="rounded-md border border-[#2A303F] px-2 py-1 text-[10px] text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white"
                        >
                          {r}
                        </button>
                      ),
                    )}
                  </div>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    placeholder="Reason shared with the partner…"
                    data-testid="document-reject-reason-input"
                    className="w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-[12px] text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={decideDoc.isPending || !rejectReason.trim()}
                      onClick={() =>
                        live &&
                        decideDoc.mutate({
                          id: live.id,
                          docType: viewingDoc.type,
                          status: "rejected",
                          reason: rejectReason,
                        })
                      }
                      data-testid="document-reject-confirm"
                      className="rounded-md bg-[#EF4444] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-[#DC2626] disabled:opacity-40"
                    >
                      Confirm rejection
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingType(null);
                        setRejectReason("");
                      }}
                      data-testid="document-reject-cancel"
                      className="rounded-md border border-[#2A303F] px-3 py-1.5 text-[11px] text-[#9BA1B0] transition-colors duration-150 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-[#7E8698]">
                    Approve or reject this document on its own — the partner's other files stay untouched.
                  </p>
                  <div className="flex items-center gap-2">
                    {viewingDoc.file_url ? (
                      <a
                        href={viewingDoc.file_url}
                        target="_blank"
                        rel="noreferrer"
                        data-testid="document-viewer-open-tab"
                        className="rounded-md border border-[#2A303F] px-3 py-1.5 text-[11px] text-[#F5D061] transition-colors duration-150 hover:border-[#D4AF37]/60"
                      >
                        Open full size
                      </a>
                    ) : null}
                    <button
                      type="button"
                      disabled={decideDoc.isPending || viewingDoc.status === "approved"}
                      onClick={() =>
                        live &&
                        decideDoc.mutate({
                          id: live.id,
                          docType: viewingDoc.type,
                          status: "approved",
                          reason: "",
                        })
                      }
                      data-testid="document-approve-button"
                      className="rounded-md border border-[#064E3B] bg-[#0D241A] px-3 py-1.5 text-[11px] font-semibold text-[#34D399] transition-colors duration-150 hover:border-[#10B981] disabled:opacity-40"
                    >
                      Approve document
                    </button>
                    <button
                      type="button"
                      disabled={decideDoc.isPending}
                      onClick={() => {
                        setRejectingType(viewingDoc.type);
                        setRejectReason("");
                      }}
                      data-testid="document-reject-button"
                      className="rounded-md border border-[#7F1D1D] bg-[#2B1114] px-3 py-1.5 text-[11px] font-semibold text-[#FF6B6B] transition-colors duration-150 hover:border-[#EF4444] disabled:opacity-40"
                    >
                      Reject document
                    </button>
                  </div>
                </div>
              )}
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
