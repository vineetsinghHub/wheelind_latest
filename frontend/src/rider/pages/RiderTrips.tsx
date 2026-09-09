import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { apiGet } from "@/lib/api";
import type { Ride } from "@/lib/types";
import { STATE_COLORS, fmtDateTime, inr2, titleize } from "@/lib/types";

export default function RiderTrips() {
  const { data, isError } = useQuery({
    queryKey: ["rider-trips"],
    queryFn: () => apiGet<Ride[]>("/rider/rides"),
  });

  const rides = data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-white">My Trips</h1>
        <p className="mt-1 text-[13px] text-[#8E95A5]">
          {rides.length > 0 ? `${rides.length} rides on your account` : "Your ride history"}
        </p>
      </div>

      {isError || rides.length === 0 ? (
        <div
          data-testid="trips-empty"
          className="rounded-2xl border border-[#232834] bg-[#11141A] px-5 py-14 text-center"
        >
          <p className="text-[14px] text-white">No rides yet</p>
          <p className="mt-1 text-[12px] text-[#8E95A5]">Your completed trips will show up here.</p>
          <Link
            to="/ride"
            data-testid="trips-book-cta"
            className="mt-4 inline-block rounded-xl bg-[#D4AF37] px-5 py-2.5 text-[13px] font-semibold text-[#0B0C10]"
          >
            Book a ride
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {rides.map((r) => (
            <li key={r.id}>
              <Link
                to={`/trip/${r.id}`}
                data-testid={`trip-card-${r.code}`}
                className="block rounded-2xl border border-[#232834] bg-[#11141A] p-4 transition-colors duration-150 hover:border-[#D4AF37]/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] text-white">
                      {r.pickup} <span className="text-[#5E6575]">→</span> {r.drop}
                    </p>
                    <p className="wl-mono mt-1 text-[11px] text-[#7E8698]">
                      {r.code} · {titleize(r.category)} · {fmtDateTime(r.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="wl-mono text-[14px] font-semibold text-[#F5D061]">{inr2(r.fare.total)}</p>
                    <span
                      className="mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{
                        color: STATE_COLORS[r.state] ?? "#8E95A5",
                        backgroundColor: `${STATE_COLORS[r.state] ?? "#8E95A5"}22`,
                      }}
                    >
                      {titleize(r.state)}
                    </span>
                  </div>
                </div>
                {r.rider_rating ? (
                  <p className="mt-2 text-[11px] text-[#F5D061]">You rated {r.rider_rating}★</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
