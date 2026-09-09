import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { CarFront, Clock, Download, Home, LogOut, Wallet } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import SignInModal from "@/rider/components/SignInModal";
import { RiderAuthContext } from "@/rider/lib/riderAuth";
import type { RiderProfile } from "@/rider/lib/riderTypes";

const TABS = [
  { to: "/ride", label: "Ride", icon: Home },
  { to: "/trips", label: "My Trips", icon: Clock },
  { to: "/wallet", label: "Wallet", icon: Wallet },
];

/** Shared chrome for every rider screen — one header, no bottom bar, so the
    booking flow reads as the same site as the landing page. */
export default function RiderLayout() {
  const { pathname } = useLocation();
  const [modal, setModal] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["rider-me"],
    queryFn: () => apiGet<RiderProfile>("/rider/me"),
    retry: false,
  });
  const signedIn = Boolean(data?.rider);

  const requireSignIn = useCallback(
    (after?: () => void) => {
      if (signedIn) {
        after?.();
        return;
      }
      pending.current = after ?? null;
      setModal(true);
    },
    [signedIn],
  );

  async function signOut() {
    await apiPost("/rider/auth/logout").catch(() => {});
    queryClient.clear();
  }

  const gated = (pathname === "/trips" || pathname === "/wallet") && !signedIn && !isLoading;

  return (
    <RiderAuthContext.Provider value={{ signedIn, loading: isLoading, requireSignIn }}>
      <div className="min-h-screen bg-[#090A0C] font-sans text-[#F4F4F6]">
        <header className="sticky top-0 z-50 border-b border-[#1B1F2A]/80 bg-[#090A0C]/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
            <Link to="/" className="flex items-center gap-2.5" data-testid="rider-logo">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#F5D061] to-[#C5A25D] text-[#0B0C10]">
                <CarFront size={18} strokeWidth={2.6} />
              </div>
              <div className="hidden sm:block">
                <p className="font-heading text-[16px] leading-none font-bold tracking-tight">
                  Wheelind
                </p>
                <p className="mt-1 text-[9px] tracking-[0.18em] text-[#C5A25D] uppercase">
                  Your ride, our pride
                </p>
              </div>
            </Link>

            <nav className="flex items-center gap-1">
              {TABS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  data-testid={`rider-tab-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
                      isActive ? "bg-[#1D2330] text-[#F5D061]" : "text-[#9BA1B0] hover:text-white"
                    }`
                  }
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <Link
                to="/#download"
                data-testid="rider-download-app"
                className="hidden items-center gap-1.5 rounded-full border border-[#2A303F] px-3.5 py-2 text-[12px] font-semibold text-[#E6E8EE] transition-colors duration-150 hover:border-[#D4AF37]/60 md:flex"
              >
                <Download size={13} />
                Download app
              </Link>
              {signedIn ? (
                <>
                  <div className="hidden text-right sm:block">
                    <p className="text-[13px] leading-none font-semibold text-white" data-testid="rider-name">
                      {data?.rider.name}
                    </p>
                    <p className="font-mono mt-1 text-[10px] text-[#8E95A5]">{data?.rider.phone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={signOut}
                    data-testid="rider-signout"
                    className="rounded-lg border border-[#2A303F] p-2 text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/50 hover:text-white"
                  >
                    <LogOut size={15} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => requireSignIn()}
                  data-testid="rider-header-signin"
                  className="rounded-full bg-[#D4AF37] px-4 py-2 text-[13px] font-semibold text-[#0B0C10] transition-colors duration-150 hover:bg-[#E5C158]"
                >
                  Sign in
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-5 py-6 pb-16">
          {gated ? (
            <div
              data-testid="rider-signin-required"
              className="mx-auto mt-10 max-w-md rounded-2xl border border-[#232834] bg-[#11141A] p-8 text-center"
            >
              <p className="font-heading text-[20px] font-bold tracking-tight">Sign in to continue</p>
              <p className="mt-2 text-[13px] text-[#8E95A5]">
                Your trips and wallet are tied to your mobile number.
              </p>
              <button
                type="button"
                onClick={() => requireSignIn()}
                data-testid="rider-gate-signin"
                className="mt-5 rounded-xl bg-[#D4AF37] px-5 py-3 text-[14px] font-semibold text-[#0B0C10] transition-colors duration-150 hover:bg-[#E5C158]"
              >
                Sign in
              </button>
            </div>
          ) : (
            <Outlet />
          )}
        </main>

        {modal ? (
          <SignInModal
            onClose={() => {
              pending.current = null;
              setModal(false);
            }}
            onSignedIn={() => {
              setModal(false);
              const run = pending.current;
              pending.current = null;
              // Let the refreshed session land before the queued action fires.
              setTimeout(() => run?.(), 400);
            }}
          />
        ) : null}
      </div>
    </RiderAuthContext.Provider>
  );
}
