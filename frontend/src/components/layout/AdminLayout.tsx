import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity, BadgeIndianRupee, CarFront, FileClock, Flag, LayoutDashboard, LifeBuoy, LogOut,
  Map, Megaphone, Percent, Radar, Users, Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet } from "@/lib/api";
import { endSession } from "@/lib/session";
import type { AdminUser } from "@/lib/types";
import { titleize } from "@/lib/types";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/fleet", label: "Live Fleet", icon: Map },
  { to: "/admin/rides", label: "Rides", icon: CarFront },
  { to: "/admin/dispatch", label: "Dispatch Lab", icon: Radar },
  { to: "/admin/drivers", label: "Drivers & KYC", icon: Users },
  { to: "/admin/riders", label: "Riders", icon: Activity },
  { to: "/admin/fares", label: "Fare Config", icon: BadgeIndianRupee },
  { to: "/admin/commissions", label: "Commission & Passes", icon: Percent },
  { to: "/admin/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/admin/wallet", label: "Wallet Ledger", icon: Wallet },
  { to: "/admin/sos", label: "SOS Incidents", icon: LifeBuoy },
  { to: "/admin/flags", label: "Feature Flags", icon: Flag },
  { to: "/admin/audit", label: "Audit Logs", icon: FileClock },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { data: admin, isError } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<AdminUser>("/auth/me"),
    retry: false,
  });

  // Redirect in an effect, never during render.
  useEffect(() => {
    if (isError) navigate("/admin/login", { replace: true });
  }, [isError, navigate]);

  async function handleLogout() {
    await endSession();
    navigate("/admin/login", { replace: true });
    toast.success("Signed out of Wheelind Admin");
  }

  // Never render the console shell (or its cached data) to an unauthenticated visitor.
  if (isError) {
    return (
      <div
        data-testid="admin-auth-redirect"
        className="flex min-h-screen items-center justify-center bg-[#090A0C] text-sm text-[#8E95A5]"
      >
        Redirecting to sign in…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#090A0C]">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-[#1B1F2A] bg-[#0D0F14] lg:flex">
        <div className="flex items-center gap-3 border-b border-[#1B1F2A] px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D4AF37] text-[#090A0C]">
            <CarFront size={18} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-base leading-none font-bold tracking-tight text-white">Wheelind</p>
            <p className="mt-1 text-[10px] tracking-[0.14em] text-[#C5A25D] uppercase">
              Your ride, our pride
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" data-testid="admin-sidebar-nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={`nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className={({ isActive }) =>
                `relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors duration-150 ${
                  isActive
                    ? "bg-[#1C1F28] font-semibold text-[#F5D061]"
                    : "text-[#9BA1B0] hover:bg-[#161A22] hover:text-white"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r bg-[#D4AF37]" />
                  )}
                  <Icon size={16} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[#1B1F2A] px-4 py-3">
          <p className="text-[10px] tracking-[0.14em] text-[#7E8698] uppercase">Kolkata · Phase 1</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[#1E222B] bg-[#0D0F14]/90 px-5 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-3">
            <span className="wl-beacon relative inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-white">Operations Console</p>
              <p className="text-[11px] text-[#7E8698]">Kolkata · Live</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {admin ? (
              <div className="text-right" data-testid="admin-identity">
                <p className="text-[13px] font-semibold text-white">{admin.name}</p>
                <p className="text-[11px] text-[#C5A25D]">{titleize(admin.role)}</p>
              </div>
            ) : null}
            <button
              type="button"
              onClick={handleLogout}
              data-testid="logout-button"
              className="flex items-center gap-2 rounded-lg border border-[#2A303F] px-3 py-2 text-[13px] text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/50 hover:text-white"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1720px] flex-1 space-y-6 p-5 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
