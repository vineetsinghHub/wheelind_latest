import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CarFront, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { AdminUser } from "@/lib/types";

const DEMO = [
  { label: "Super Admin", email: "admin@wheelind.in", password: "Wheelind@2026" },
  { label: "Fleet Manager", email: "fleet@wheelind.in", password: "Fleet@2026" },
  { label: "Ops Lead", email: "ops@wheelind.in", password: "Ops@2026" },
];

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@wheelind.in");
  const [password, setPassword] = useState("Wheelind@2026");
  const [error, setError] = useState("");

  const login = useMutation({
    mutationFn: (creds: { email: string; password: string }) =>
      apiPost<AdminUser>("/auth/login", creds),
    onSuccess: (admin) => {
      beginSession();
      toast.success(`Welcome back, ${admin.name}`);
      navigate("/", { replace: true });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError && err.body && typeof err.body === "object"
          ? String((err.body as { detail?: string }).detail ?? "Login failed")
          : "Unable to reach the Wheelind API";
      setError(msg);
    },
  });

  return (
    <div className="grid min-h-screen grid-cols-1 bg-[#090A0C] lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <img
          src="https://images.unsplash.com/photo-1695141988189-a235ffa40bbb?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400"
          alt="Kolkata yellow taxi"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#090A0C]/85 to-[#090A0C]/96" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#D4AF37] text-[#090A0C]">
            <CarFront size={22} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight text-white">Wheelind</p>
            <p className="text-[11px] tracking-[0.16em] text-[#C5A25D] uppercase">
              Your ride, our pride
            </p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-[42px] leading-[1.08] font-bold tracking-tight text-white">
            Kolkata's ride operations,
            <span className="block text-[#D4AF37]">under one console.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-[#C2C7D4]">
            Live dispatch, driver KYC, fare governance, campaign rollout, ledger-first wallets and
            SOS response — built for 3,000 rides a day.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {["Safe Rides", "Reliable Service", "Customer First"].map((p) => (
              <span
                key={p}
                className="rounded-full border border-[#634E1D] bg-[#2A2312] px-3 py-1.5 text-xs font-medium text-[#F5D061]"
              >
                {p}
              </span>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] tracking-[0.14em] text-[#7E8698] uppercase">
          Phase 1 · Kolkata, India
        </p>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D4AF37] text-[#090A0C]">
              <CarFront size={20} strokeWidth={2.5} />
            </div>
            <p className="text-lg font-bold text-white">Wheelind</p>
          </div>

          <p className="wl-overline">Admin Access</p>
          <h2 className="mt-2 text-[30px] font-bold tracking-tight text-white">Sign in</h2>
          <p className="mt-2 text-sm text-[#8E95A5]">
            Operations, finance and safety controls for the Wheelind fleet.
          </p>

          <form
            data-testid="login-form"
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              login.mutate({ email, password });
            }}
          >
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email-input"
                className="w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3.5 py-2.5 text-sm text-white transition-colors duration-150 outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
                placeholder="admin@wheelind.in"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-[#9BA1B0]">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password-input"
                className="w-full rounded-lg border border-[#2A303F] bg-[#11141A] px-3.5 py-2.5 text-sm text-white transition-colors duration-150 outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <p
                data-testid="login-error"
                className="rounded-lg border border-[#7F1D1D] bg-[#2B1114] px-3 py-2 text-xs text-[#FF6B6B]"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={login.isPending}
              data-testid="login-submit-button"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2.5 text-sm font-semibold text-[#090A0C] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-60"
            >
              {login.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {login.isPending ? "Verifying…" : "Enter console"}
            </button>
          </form>

          <div className="mt-8 rounded-xl border border-[#232834] bg-[#11141A] p-4">
            <p className="wl-overline">Instant demo access</p>
            <div className="mt-3 grid gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  data-testid={`demo-login-${d.label.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                    setError("");
                    login.mutate({ email: d.email, password: d.password });
                  }}
                  className="flex items-center justify-between rounded-lg border border-[#2A303F] bg-[#161A22] px-3 py-2 text-left transition-colors duration-150 hover:border-[#D4AF37]/50"
                >
                  <span className="text-[13px] font-medium text-white">{d.label}</span>
                  <span className="wl-mono text-[11px] text-[#8E95A5]">{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
