import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { CarFront, Clock, Home, LogOut, Wallet } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { RiderProfile } from "@/rider/lib/riderTypes";

const TABS = [
  { to: "/ride", label: "Ride", icon: Home, end: true },
  { to: "/trips", label: "My Trips", icon: Clock },
  { to: "/wallet", label: "Wallet", icon: Wallet },
];

export default function RiderLayout() {
  const navigate = useNavigate();
  const { data, isError, isLoading } = useQuery({
    queryKey: ["rider-me"],
    queryFn: () => apiGet<RiderProfile>("/rider/me"),
    retry: false,
  });

  useEffect(() => {
    if (isError) navigate("/welcome", { replace: true });
  }, [isError, navigate]);

  async function signOut() {
    await apiPost("/rider/auth/logout").catch(() => {});
    queryClient.clear();
    navigate("/welcome", { replace: true });
  }

  if (isLoading || isError) {
    return (
      <div
        data-testid="rider-auth-gate"
        className="flex min-h-screen items-center justify-center bg-[#0B0C10] text-sm text-[#8E95A5]"
      >
        Loading Wheelind…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0C10] pb-24">
      <header className="sticky top-0 z-40 border-b border-[#1B1F2A] bg-[#0B0C10]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D4AF37] text-[#0B0C10]">
              <CarFront size={18} strokeWidth={2.6} />
            </div>
            <div>
              <p className="text-[15px] leading-none font-bold text-white">Wheelind</p>
              <p className="mt-0.5 text-[9px] tracking-[0.16em] text-[#C5A25D] uppercase">
                Your ride, our pride
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[13px] leading-none font-semibold text-white" data-testid="rider-name">
                {data?.rider.name}
              </p>
              <p className="wl-mono mt-1 text-[10px] text-[#8E95A5]">{data?.rider.phone}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              data-testid="rider-signout"
              className="rounded-lg border border-[#2A303F] p-2 text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/50 hover:text-white"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#1B1F2A] bg-[#0D0F14]/97 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={`rider-tab-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors duration-150 ${
                  isActive ? "text-[#F5D061]" : "text-[#7E8698] hover:text-white"
                }`
              }
            >
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
