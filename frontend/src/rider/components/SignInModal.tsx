import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck, Smartphone, X } from "lucide-react";
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

function newCaptcha() {
  const a = 2 + Math.floor(Math.random() * 8);
  const b = 2 + Math.floor(Math.random() * 8);
  return { a, b, answer: a + b };
}

/** Sign-in modal shown at the point of intent (requesting a ride, wallet, trips). */
export default function SignInModal({
  onClose,
  onSignedIn,
}: {
  onClose: () => void;
  onSignedIn: (r: Rider) => void;
}) {
  const [phone, setPhone] = useState("9830112233");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [captcha, setCaptcha] = useState(() => newCaptcha());
  const [captchaInput, setCaptchaInput] = useState("");
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);

  const captchaOk = useMemo(
    () => captchaInput.trim() !== "" && Number(captchaInput) === captcha.answer,
    [captchaInput, captcha],
  );

  const send = useMutation({
    mutationFn: () => apiPost<OtpChallenge>("/rider/auth/request-otp", { phone: `+91${phone.slice(-10)}` }),
    onSuccess: (c) => {
      setChallenge(c);
      setOtp(c.otp_hint);
      toast.success(`OTP ${c.otp_hint} (shown here — no SMS is sent)`);
    },
    onError: (e) => {
      setCaptcha(newCaptcha());
      setCaptchaInput("");
      toast.error(msg(e, "Could not send the OTP"));
    },
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
      onSignedIn(r);
    },
    onError: (e) => toast.error(msg(e, "Verification failed")),
  });

  return (
    <div
      data-testid="signin-modal"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#05060899] p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#232834] bg-[#11141A] p-6 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.95)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#C5A25D] uppercase">
              {challenge ? "Verify" : "Sign in to continue"}
            </p>
            <h2 className="font-heading mt-1.5 text-[20px] font-bold tracking-tight text-white">
              {challenge ? "Enter the 4-digit code" : "Confirm your number to request"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="signin-modal-close"
            className="rounded-lg border border-[#2A303F] p-1.5 text-[#9BA1B0] transition-colors duration-150 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        {!challenge ? (
          <form
            data-testid="signin-phone-form"
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!captchaOk) {
                toast.error("Captcha answer is incorrect");
                return;
              }
              send.mutate();
            }}
          >
            <div className="flex items-center gap-2 rounded-xl border border-[#2A303F] bg-[#0D0F14] px-3 py-3 focus-within:border-[#D4AF37]">
              <Smartphone size={16} className="text-[#8E95A5]" />
              <span className="font-mono text-sm text-[#8E95A5]">+91</span>
              <input
                autoFocus
                inputMode="numeric"
                maxLength={10}
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                data-testid="signin-phone-input"
                className="font-mono flex-1 bg-transparent text-[15px] tracking-wide text-white outline-none placeholder:text-[#5E6575]"
                placeholder="98301 12233"
              />
            </div>

            <div className="mt-3 rounded-xl border border-[#2A303F] bg-[#0D0F14] p-3">
              <p className="text-[11px] font-medium text-[#9BA1B0]">
                Security check — required before we send an OTP
              </p>
              <div className="mt-2 flex items-center gap-3">
                <span
                  data-testid="signin-captcha-question"
                  className="font-mono rounded-lg bg-[#1D2330] px-3 py-2 text-[15px] tracking-[0.2em] text-[#F5D061] select-none"
                  style={{ textDecoration: "line-through solid #33394a" }}
                >
                  {captcha.a} + {captcha.b} = ?
                </span>
                <input
                  inputMode="numeric"
                  required
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value.replace(/\D/g, ""))}
                  data-testid="signin-captcha-input"
                  placeholder="Answer"
                  className="font-mono w-24 rounded-lg border border-[#2A303F] bg-[#11141A] px-3 py-2 text-[14px] text-white outline-none focus:border-[#D4AF37]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCaptcha(newCaptcha());
                    setCaptchaInput("");
                  }}
                  data-testid="signin-captcha-refresh"
                  className="text-[11px] text-[#8E95A5] transition-colors duration-150 hover:text-white"
                >
                  New puzzle
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={send.isPending || phone.length < 10 || !captchaOk}
              data-testid="signin-send-otp"
              className="mt-4 w-full rounded-xl bg-[#D4AF37] py-3.5 text-[15px] font-semibold text-[#0B0C10] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-50"
            >
              {send.isPending ? "Sending…" : "Send OTP"}
            </button>
            <p className="mt-3 text-center text-[11px] text-[#7E8698]">
              No SMS gateway is connected — the code appears on screen.
            </p>
          </form>
        ) : (
          <form
            data-testid="signin-otp-form"
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              verify.mutate();
            }}
          >
            <p className="text-[13px] text-[#8E95A5]">
              Sent to {challenge.phone} · demo code{" "}
              <span className="font-mono text-[#F5D061]">{challenge.otp_hint}</span>
            </p>
            <input
              autoFocus
              inputMode="numeric"
              maxLength={4}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              data-testid="signin-otp-input"
              className="font-mono mt-4 w-full rounded-xl border border-[#2A303F] bg-[#0D0F14] py-3.5 text-center text-2xl tracking-[0.5em] text-white outline-none focus:border-[#D4AF37]"
              placeholder="0000"
            />
            {challenge.is_new_user ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="signin-name-input"
                placeholder="Your name"
                className="mt-3 w-full rounded-xl border border-[#2A303F] bg-[#0D0F14] px-3.5 py-3 text-sm text-white outline-none placeholder:text-[#5E6575] focus:border-[#D4AF37]"
              />
            ) : null}
            <button
              type="submit"
              disabled={verify.isPending || otp.length !== 4}
              data-testid="signin-verify-otp"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] py-3.5 text-[15px] font-semibold text-[#0B0C10] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-50"
            >
              <ShieldCheck size={16} />
              {verify.isPending ? "Verifying…" : "Verify & continue"}
            </button>
            <button
              type="button"
              onClick={() => setChallenge(null)}
              data-testid="signin-change-number"
              className="mt-2 w-full py-2 text-[12px] text-[#8E95A5] hover:text-white"
            >
              Change number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
