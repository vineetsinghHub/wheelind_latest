import { STATE_COLORS, titleize } from "@/lib/types";

export function StatusBadge({ state, testId }: { state: string; testId?: string }) {
  const color = STATE_COLORS[state] ?? "#8E95A5";
  return (
    <span
      data-testid={testId}
      className="wl-mono inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ color, borderColor: `${color}55`, backgroundColor: `${color}18` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {titleize(state)}
    </span>
  );
}

const TONES: Record<string, string> = {
  approved: "#10B981",
  active: "#10B981",
  paid: "#10B981",
  pending: "#F59E0B",
  paused: "#F59E0B",
  action_required: "#F97316",
  restricted: "#F97316",
  rejected: "#EF4444",
  blocked: "#EF4444",
  disputed: "#EF4444",
  critical: "#DC2626",
  high: "#F97316",
  medium: "#F59E0B",
  open: "#EF4444",
  acknowledged: "#3B82F6",
  escalated: "#8B5CF6",
  resolved: "#10B981",
  expired: "#9CA3AF",
  draft: "#64748B",
  refunded: "#3B82F6",
};

export function ExpiryBadge({
  status,
  days,
  testId,
}: {
  status: "expired" | "expiring_soon" | "valid" | null;
  days: number | null;
  testId?: string;
}) {
  if (!status || days === null) return null;
  const map = {
    expired: { color: "#EF4444", label: `Expired ${Math.abs(days)}d ago` },
    expiring_soon: { color: "#F59E0B", label: days === 0 ? "Expires today" : `Expires in ${days}d` },
    valid: { color: "#10B981", label: `Valid ${days}d` },
  } as const;
  const { color, label } = map[status];
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      style={{ color, borderColor: `${color}55`, backgroundColor: `${color}18` }}
    >
      {label}
    </span>
  );
}

export function ToneBadge({ value, testId }: { value: string; testId?: string }) {
  const color = TONES[value] ?? "#8E95A5";
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ color, borderColor: `${color}55`, backgroundColor: `${color}18` }}
    >
      {titleize(value)}
    </span>
  );
}
