import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Phone, Share2, Star, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiPost } from "@/lib/api";
import type { RideWithDriver, TripShare } from "@/rider/lib/riderTypes";
import { RIDE_STAGE_COPY } from "@/rider/lib/riderTypes";
import { inr2, titleize } from "@/lib/types";
import TripMap from "@/rider/components/TripMap";

const SEARCH_TIMEOUT = 180;

function msg(e: unknown, fallback: string) {
  if (e instanceof ApiError && e.body && typeof e.body === "object") {
    const d = (e.body as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

export default function RiderTrip() {
  const { rideId = "" } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [otp, setOtp] = useState("");
  const [rating, setRating] = useState(0);

  const { data, isError } = useQuery({
    queryKey: ["rider-trip", rideId],
    queryFn: () => apiGet<RideWithDriver>(`/rider/rides/${rideId}`),
    refetchInterval: 4000,
  });

  const ride = data?.ride;
  const searching = ride?.state === "searching";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["rider-trip", rideId] });
    qc.invalidateQueries({ queryKey: ["rider-active"] });
  };

  const act = <T,>(path: string, body?: unknown) => apiPost<T>(`/rider/rides/${rideId}${path}`, body);

  const match = useMutation({ mutationFn: () => act<RideWithDriver>("/match"), onSuccess: invalidate });
  const advance = useMutation({
    mutationFn: () => act<RideWithDriver>("/advance"),
    onSuccess: invalidate,
    onError: (e) => toast.error(msg(e, "Could not advance the trip")),
  });
  const start = useMutation({
    mutationFn: () => act<RideWithDriver>("/start", { otp }),
    onSuccess: () => {
      toast.success("OTP verified — trip started");
      invalidate();
    },
    onError: (e) => toast.error(msg(e, "Could not start the trip")),
  });
  const complete = useMutation({
    mutationFn: () => act<RideWithDriver>("/complete"),
    onSuccess: () => {
      toast.success("Trip completed");
      invalidate();
    },
    onError: (e) => toast.error(msg(e, "Could not complete the trip")),
  });
  const cancel = useMutation({
    mutationFn: () => act<RideWithDriver>("/cancel"),
    onSuccess: (r) => {
      toast.success(r.ride.cancellation_reason ?? "Ride cancelled");
      invalidate();
    },
    onError: (e) => toast.error(msg(e, "Could not cancel")),
  });
  const bump = useMutation({
    mutationFn: (amount: number) => act<RideWithDriver>("/increase-fare", { amount }),
    onSuccess: () => {
      toast.success("Fare raised — searching again");
      invalidate();
    },
    onError: (e) => toast.error(msg(e, "Could not raise the fare")),
  });
  const rate = useMutation({
    mutationFn: (stars: number) => act("/rate", { rating: stars, comment: "" }),
    onSuccess: () => {
      toast.success("Thanks for the feedback");
      invalidate();
    },
    onError: (e) => toast.error(msg(e, "Could not submit the rating")),
  });
  const sos = useMutation({
    mutationFn: () => act("/sos", { reason: "Rider pressed SOS from the ride screen" }),
    onSuccess: () => toast.success("SOS raised — our safety desk has been alerted"),
    onError: (e) => toast.error(msg(e, "Could not raise SOS")),
  });
  const share = useMutation({
    mutationFn: () => apiGet<TripShare>(`/rider/rides/${rideId}/share`),
    onSuccess: (s) => toast.success(`Trip link live for ${s.expires_in_min} min: ${s.share_url}`),
  });

  // While searching, keep asking the dispatcher for a driver.
  useEffect(() => {
    if (!searching) return;
    const t = setInterval(() => match.mutate(), 4000);
    match.mutate();
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, rideId]);

  if (isError) {
    return (
      <div className="py-20 text-center text-sm text-[#8E95A5]" data-testid="trip-not-found">
        We couldn't load that trip.
      </div>
    );
  }
  if (!ride) {
    return <div className="py-20 text-center text-sm text-[#8E95A5]">Loading trip…</div>;
  }

  const stage = RIDE_STAGE_COPY[ride.state] ?? { title: titleize(ride.state), sub: "" };
  const elapsed = data.seconds_searching ?? 0;
  const pct = Math.min(100, (elapsed / SEARCH_TIMEOUT) * 100);
  const closed = ["completed", "cancelled", "expired"].includes(ride.state);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#232834] bg-[#11141A] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="wl-mono text-[11px] text-[#C5A25D]">{ride.code}</p>
            <h1 className="mt-1 text-[22px] font-bold tracking-tight text-white" data-testid="trip-stage-title">
              {stage.title}
            </h1>
            <p className="mt-0.5 text-[13px] text-[#8E95A5]">{stage.sub}</p>
          </div>
          <p className="wl-mono shrink-0 text-lg font-semibold text-[#F5D061]" data-testid="trip-fare">
            {inr2(ride.fare.total)}
          </p>
        </div>

        {searching ? (
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#1D2330]">
              <div
                className="h-full rounded-full bg-[#D4AF37] transition-[width] duration-1000"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="wl-mono mt-1.5 text-[11px] text-[#8E95A5]" data-testid="search-timer">
              {elapsed}s of {SEARCH_TIMEOUT}s — search stops automatically
            </p>
          </div>
        ) : null}

        <div className="mt-4 space-y-2 border-t border-[#232834] pt-3 text-[13px]">
          <p className="flex items-center gap-2 text-white">
            <span className="h-2 w-2 rounded-full bg-[#34D399]" /> {ride.pickup}
          </p>
          <p className="flex items-center gap-2 text-white">
            <span className="h-2 w-2 rounded-full bg-[#F5D061]" /> {ride.drop}
          </p>
          <p className="wl-mono text-[11px] text-[#7E8698]">
            {ride.distance_km} km · {ride.duration_min} min · {titleize(ride.payment_method)}
            {ride.promo_code ? ` · ${ride.promo_code}` : ""}
          </p>
        </div>
      </div>

      {ride.driver_name ? (
        <TripMap
          pickup={[ride.pickup_lat, ride.pickup_lng]}
          drop={ride.drop_lat && ride.drop_lng ? [ride.drop_lat, ride.drop_lng] : null}
          driver={data.driver_lat && data.driver_lng ? [data.driver_lat, data.driver_lng] : null}
          inProgress={ride.state === "in_progress"}
        />
      ) : null}

      {ride.driver_name ? (
        <div className="rounded-2xl border border-[#232834] bg-[#11141A] p-4" data-testid="driver-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold text-white">{ride.driver_name}</p>
              <p className="wl-mono mt-0.5 text-[11px] text-[#8E95A5]">
                {data.vehicle_model} · {data.vehicle_number}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#F5D061]">
                <Star size={10} fill="#F5D061" /> {data.driver_rating}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toast.info(`Masked line: ${data.masked_driver_phone}`)}
                data-testid="call-driver-button"
                className="rounded-xl border border-[#2A303F] p-2.5 text-[#34D399] transition-colors duration-150 hover:border-[#10B981]"
              >
                <Phone size={16} />
              </button>
              <button
                type="button"
                onClick={() => share.mutate()}
                data-testid="share-trip-button"
                className="rounded-xl border border-[#2A303F] p-2.5 text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white"
              >
                <Share2 size={16} />
              </button>
            </div>
          </div>

          {["otp_pending", "waiting_at_pickup"].includes(ride.state) ? (
            <div className="mt-4 rounded-xl border border-[#634E1D] bg-[#2A2312] p-3">
              <p className="text-[11px] text-[#F5D061]">Share this OTP with your driver</p>
              <p className="wl-mono mt-1 text-3xl font-bold tracking-[0.3em] text-white" data-testid="trip-otp">
                {ride.otp}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Driver-side actions are simulated here: there is no driver app yet. */}
      {!closed ? (
        <div className="rounded-2xl border border-dashed border-[#2E3547] bg-[#0F1218] p-4">
          <p className="wl-overline">Simulate driver</p>
          <p className="mt-1 text-[11px] text-[#7E8698]">
            No driver app exists yet, so drive the trip forward from here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {["driver_assigned", "driver_arriving", "waiting_at_pickup"].includes(ride.state) ? (
              <button
                type="button"
                disabled={advance.isPending}
                onClick={() => advance.mutate()}
                data-testid="simulate-advance"
                className="flex items-center gap-1.5 rounded-lg border border-[#2A303F] px-3 py-2 text-[12px] text-[#C2C7D4] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white disabled:opacity-40"
              >
                Advance trip <ArrowRight size={12} />
              </button>
            ) : null}
            {ride.state === "in_progress" ? (
              <button
                type="button"
                disabled={complete.isPending}
                onClick={() => complete.mutate()}
                data-testid="simulate-complete"
                className="rounded-lg border border-[#064E3B] bg-[#0D241A] px-3 py-2 text-[12px] font-semibold text-[#34D399] transition-colors duration-150 hover:border-[#10B981] disabled:opacity-40"
              >
                End trip &amp; pay
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {["otp_pending", "waiting_at_pickup"].includes(ride.state) ? (
        <div className="rounded-2xl border border-[#232834] bg-[#11141A] p-4">
          <p className="text-[12px] font-medium text-[#9BA1B0]">Driver entering your OTP</p>
          <div className="mt-2 flex gap-2">
            <input
              inputMode="numeric"
              maxLength={4}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="4-digit code"
              data-testid="start-otp-input"
              className="wl-mono flex-1 rounded-xl border border-[#2A303F] bg-[#0D0F14] px-3.5 py-2.5 text-center tracking-[0.3em] text-white outline-none focus:border-[#D4AF37]"
            />
            <button
              type="button"
              disabled={start.isPending || otp.length !== 4}
              onClick={() => start.mutate()}
              data-testid="start-trip-button"
              className="rounded-xl bg-[#D4AF37] px-4 py-2.5 text-[13px] font-semibold text-[#0B0C10] transition-colors duration-150 hover:bg-[#E5C158] disabled:opacity-50"
            >
              Start trip
            </button>
          </div>
        </div>
      ) : null}

      {ride.state === "expired" ? (
        <div className="rounded-2xl border border-[#634E1D] bg-[#2A2312] p-4" data-testid="timeout-panel">
          <p className="text-[13px] font-semibold text-[#F5D061]">No partner accepted in 3 minutes</p>
          <p className="mt-1 text-[12px] text-[#C2C7D4]">
            Raising the fare improves your chances at busy hours.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[20, 40, 60].map((amt) => (
              <button
                key={amt}
                type="button"
                disabled={bump.isPending}
                onClick={() => bump.mutate(amt)}
                data-testid={`bump-fare-${amt}`}
                className="flex items-center gap-1 rounded-lg border border-[#D4AF37]/50 bg-[#0D0F14] px-3 py-2 text-[12px] font-semibold text-[#F5D061] transition-colors duration-150 hover:border-[#D4AF37] disabled:opacity-40"
              >
                <TrendingUp size={12} /> +₹{amt} &amp; retry
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {ride.state === "completed" ? (
        <div className="rounded-2xl border border-[#232834] bg-[#11141A] p-5" data-testid="rating-panel">
          <p className="text-[14px] font-semibold text-white">Rate your ride</p>
          <div className="mt-3 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setRating(s);
                  rate.mutate(s);
                }}
                data-testid={`rate-star-${s}`}
                className="p-1"
              >
                <Star
                  size={26}
                  className="transition-colors duration-150"
                  fill={s <= (ride.rider_rating ?? rating) ? "#F5D061" : "none"}
                  color={s <= (ride.rider_rating ?? rating) ? "#F5D061" : "#5E6575"}
                />
              </button>
            ))}
          </div>
          {ride.rider_rating ? (
            <p className="mt-2 text-[12px] text-[#34D399]" data-testid="rating-saved">
              You rated this trip {ride.rider_rating}★
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => navigate("/ride")}
            data-testid="book-another-button"
            className="mt-4 w-full rounded-xl bg-[#D4AF37] py-3 text-[14px] font-semibold text-[#0B0C10] transition-colors duration-150 hover:bg-[#E5C158]"
          >
            Book another ride
          </button>
        </div>
      ) : null}

      {closed && ride.state !== "completed" ? (
        <button
          type="button"
          onClick={() => navigate("/ride")}
          data-testid="back-to-book-button"
          className="w-full rounded-xl border border-[#2A303F] py-3 text-[14px] text-[#C2C7D4] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white"
        >
          Back to booking
        </button>
      ) : null}

      {!closed ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={sos.isPending}
            onClick={() => sos.mutate()}
            data-testid="sos-button"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#7F1D1D] bg-[#2B1114] py-3 text-[13px] font-bold text-[#FF6B6B] transition-colors duration-150 hover:border-[#EF4444] disabled:opacity-50"
          >
            <AlertTriangle size={15} /> SOS
          </button>
          <button
            type="button"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
            data-testid="cancel-ride-button"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#2A303F] py-3 text-[13px] text-[#9BA1B0] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white disabled:opacity-50"
          >
            <X size={15} /> Cancel ride
          </button>
        </div>
      ) : null}
    </div>
  );
}
