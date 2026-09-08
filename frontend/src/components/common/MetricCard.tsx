import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  sub,
  icon,
  accent = "#D4AF37",
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  accent?: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="wl-rise rounded-xl border border-[#232834] bg-[#11141A] p-5 transition-colors duration-150 hover:border-[#D4AF37]/40"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="wl-overline">{label}</p>
        {icon ? (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${accent}18`, color: accent }}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="wl-mono mt-3 text-2xl font-semibold text-white" data-testid={`${testId}-value`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-[#8E95A5]">{sub}</p> : null}
    </div>
  );
}

export function PanelCard({
  title,
  action,
  children,
  className = "",
  testId,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={`rounded-xl border border-[#232834] bg-[#11141A] ${className}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232834] px-5 py-3.5">
        <h2 className="text-sm font-semibold tracking-tight text-white">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ message, testId }: { message: string; testId?: string }) {
  return (
    <div data-testid={testId} className="px-5 py-14 text-center text-sm text-[#8E95A5]">
      {message}
    </div>
  );
}
