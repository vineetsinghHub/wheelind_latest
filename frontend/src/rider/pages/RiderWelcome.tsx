import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CarFront, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { OtpChallenge } from "@/rider/lib/riderTypes";
import type { Rider } from "@/lib/types";

function msg(e: unknown, fallback: string) {
  if (e instanceof ApiError && e.body && typeof e.body === "object") {
    const d = (e.body as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

export default function RiderWelcome() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("9830112233");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);

  const send = useMutation({
    mutationFn: () => apiPost<OtpChallenge>("/rider/auth/request-otp", { phone: `+91${phone.slice(-10)}` }),
    onSuccess: (c) => {
      setChallenge(c);
      setOtp(c.otp_hint);
      toast.success(`OTP ${c.otp_hint} (shown here — no SMS is sent)`);
    },
    onError: (e) => toast.error(msg(e, "Could not send the OTP")),
  });

  const verify = useMutation({
    mutationFn: () =>
      apiPost<Rider>("/rider/auth/verify", {
        phone: challenge!.phone,
        otp,
        name: name.trim() || null,
      }),
    onSuccess: (r) => {
      queryClient.clear();
      toast.success(`Welcome, ${r.name}`);
      navigate("/", { replace: true });
    },
    onError: (e) => toast.error(msg(e, "Verification failed")),
  });

  return (
    <div className="min-h-screen bg-[#0B0C10]">
      <div className="relative h-[42vh] min-h-[280px] overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1695141988189-a235ffa40bbb?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400"
          alt="Kolkata street"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0C10]/55 via-[#0B0C10]/80 to-[#0B0C10]" />
        <div className="relative mx-auto flex h-full max-w-2xl flex-col justify-between px-5 py-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D4AF37] text-[#0B0C10]">
              <CarFront size={20} strokeWidth={2.6} />
            </div>
            <div>
              <p className="text-lg leading-none font-bold text-white">Wheelind</p>
              <p className="mt-1 text-[10px] tracking-[0.16em] text-[#C5A25D] uppercase">
                Your ride, our pride
              </p>
            </div>
          </div>
          <div>
            <h1 className="text-[32px] leading-[1.1] font-bold tracking-tight text-white">
              Kolkata, get moving.
            </h1>
            <p className="mt-2 max-w-sm text-[14px] text-[#C2C7D4]">
              Bikes, autos and cabs in minutes — upfront fares, OTP-verified trips, and safety
              built in.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-5 pb-12">
        <div className="-mt-6 rounded-2xl border border-[#232834] bg-[#11141A] p-5 shadow-2xl">
          {!challenge ? (
            <form
              data-testid="rider-phone-form"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate();
              }}
            >
              <p className="wl-overline">Get started</p>
              <h2 className="mt-1.5 text-xl font-bold text-white">Enter your mobile number</h2>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#2A303F] bg-[#0D0F14] px-3 py-3 focus-within:border-[#D4AF37]">
                <Smartphone size={16} className="text-[#8E95A5]" />
                <span className="wl-mono text-sm text-[#8E95A5]">+91</span>
                <input
                  autoFocus
                  inputMode="numeric"
                  maxLength={10}
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  data-testid="rider-phone-input"
                  className="wl-mono flex-1 bg-transparent text-[15px] tracking-wide text-white outline-none placeholder:text-[#5E6575]"
                  placeholder="98301 12233"
                />
              </div>
              <button
                type="submit"
                disabled={send.isPending || phone.length < 10}
                data-testid="rider-send-otp"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] py-3.5 text-[15px] font-semibold text-[#0B0C10] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-50"
              >
                {send.isPending ? "Sending…" : "Continue"}
                <ArrowRight size={16} />
              </button>
              <p className="mt-3 text-center text-[11px] text-[#7E8698]">
                No SMS gateway is connected — the code appears on screen.
              </p>
            </form>
          ) : (
            <form
              data-testid="rider-otp-form"
              onSubmit={(e) => {
                e.preventDefault();
                verify.mutate();
              }}
            >
              <p className="wl-overline">Verify</p>
              <h2 className="mt-1.5 text-xl font-bold text-white">Enter the 4-digit code</h2>
              <p className="mt-1 text-[13px] text-[#8E95A5]">
                Sent to {challenge.phone} · demo code{" "}
                <span className="wl-mono text-[#F5D061]">{challenge.otp_hint}</span>
              </p>

              <input
                autoFocus
                inputMode="numeric"
                maxLength={4}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                data-testid="rider-otp-input"
                className="wl-mono mt-4 w-full rounded-xl border border-[#2A303F] bg-[#0D0F14] py-3.5 text-center text-2xl tracking-[0.5em] text-white outline-none focus:border-[#D4AF37]"
                placeholder="0000"
              />

              {challenge.is_new_user ? (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="rider-name-input"
                  placeholder="Your name"
                  className="mt-3 w-full rounded-xl border border-[#2A303F] bg-[#0D0F14] px-3.5 py-3 text-sm text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
                />
              ) : null}

              <button
                type="submit"
                disabled={verify.isPending || otp.length !== 4}
                data-testid="rider-verify-otp"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] py-3.5 text-[15px] font-semibold text-[#0B0C10] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-50"
              >
                <ShieldCheck size={16} />
                {verify.isPending ? "Verifying…" : "Verify & continue"}
              </button>
              <button
                type="button"
                onClick={() => setChallenge(null)}
                data-testid="rider-change-number"
                className="mt-2 w-full py-2 text-[12px] text-[#8E95A5] hover:text-white"
              >
                Change number
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            ["Safe Rides", "OTP-verified starts"],
            ["Reliable Service", "Upfront fares"],
            ["Customer First", "24×7 support"],
          ].map(([t, s]) => (
            <div key={t} className="rounded-xl border border-[#232834] bg-[#11141A] p-3">
              <Sparkles size={14} className="text-[#D4AF37]" />
              <p className="mt-2 text-[12px] font-semibold text-white">{t}</p>
              <p className="mt-0.5 text-[10px] text-[#7E8698]">{s}</p>
            </div>
          ))}
        </div>

        <a
          href="/admin"
          data-testid="admin-portal-link"
          className="mt-6 block text-center text-[11px] text-[#5E6575] transition-colors duration-150 hover:text-[#8E95A5]"
        >
          Wheelind staff? Open the admin console
        </a>
      </div>
    </div>
  );
}
