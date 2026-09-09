import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeIndianRupee,
  Bike,
  Car,
  CarFront,
  CarTaxiFront,
  Clock,
  Download,
  Gift,
  HeartHandshake,
  MapPin,
  Package,
  PhoneCall,
  ShieldCheck,
  Siren,
  Sparkles,
  Star,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

import { apiGet } from "@/lib/api";
import type { RiderProfile } from "@/rider/lib/riderTypes";

const HERO_IMG =
  "https://images.unsplash.com/photo-1638273349088-eec0b06c1765?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600";
const RIDER_IMG =
  "https://images.unsplash.com/photo-1771575520403-df44ea769881?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";
const CITY_IMG =
  "https://images.unsplash.com/photo-1720195343674-e20e1dcfadf5?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

const SERVICES = [
  { icon: Bike, name: "Bike", blurb: "Beat the jam, ₹19 base" },
  { icon: CarTaxiFront, name: "Auto", blurb: "Metered, no haggling" },
  { icon: Car, name: "Cab", blurb: "AC hatchbacks, 4 seats" },
  { icon: CarFront, name: "Sedan", blurb: "Extra legroom & boot" },
  { icon: Users, name: "XL", blurb: "6 seats for the group" },
  { icon: Clock, name: "Rentals", blurb: "Hourly packages" },
  { icon: MapPin, name: "Outstation", blurb: "Digha, Shantiniketan" },
  { icon: Package, name: "Parcel", blurb: "Send it across town" },
];

const STEPS = [
  {
    n: "01",
    title: "Set pickup & drop",
    body: "Drop a pin anywhere in Kolkata or use your current location — we snap it to the nearest safe pickup point.",
  },
  {
    n: "02",
    title: "See the exact fare",
    body: "Upfront pricing with the full breakup — base, distance, time, surge and taxes. No meter surprises.",
  },
  {
    n: "03",
    title: "Ride OTP-verified",
    body: "Share your 4-digit OTP with the captain. The trip cannot start without it, and you can track it live.",
  },
];

const SAFETY = [
  { icon: ShieldCheck, t: "OTP-verified starts", d: "No OTP, no trip. Every ride is locked to you." },
  { icon: Siren, t: "One-tap SOS", d: "Alerts our Kolkata safety desk with your live location." },
  { icon: PhoneCall, t: "Masked calling", d: "Talk to your captain without sharing your number." },
  { icon: MapPin, t: "Live trip sharing", d: "Send a tracking link to family in one tap." },
];

const OFFERS = [
  { tag: "Durga Puja", t: "Pujo Special 25%", d: "Flat 25% off cab rides across the pandal circuit.", code: "PUJO25" },
  { tag: "New user", t: "First ride free", d: "Up to ₹100 off on your very first Wheelind trip.", code: "WELCOME" },
  { tag: "Wallet", t: "10% cashback", d: "Recharge ₹1,000 and get ₹100 back instantly.", code: "TOPUP10" },
];

const FAQ = [
  {
    q: "Which areas of Kolkata do you cover?",
    a: "We operate across Kolkata city, Salt Lake, New Town, Howrah and the airport corridor, with outstation runs to nearby Bengal destinations.",
  },
  {
    q: "How do I pay?",
    a: "UPI, credit or debit card, net banking, Wheelind Wallet, or plain cash to the captain. Pick your method before you book.",
  },
  {
    q: "What if no captain accepts?",
    a: "The search stops after 3–5 minutes instead of spinning forever. You can raise the fare a little and retry immediately.",
  },
  {
    q: "How do captains earn?",
    a: "Choose a commission plan or a zero-commission subscription pass — daily, weekly or monthly. Earnings are visible ride by ride.",
  },
];

function Overline({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold tracking-[0.18em] text-[#C5A25D] uppercase">{children}</p>
  );
}

export default function RiderLanding() {
  const { data: me } = useQuery({
    queryKey: ["rider-me"],
    queryFn: () => apiGet<RiderProfile>("/rider/me"),
    retry: false,
  });
  const signedIn = Boolean(me?.rider);
  const bookHref = "/ride";

  return (
    <div className="min-h-screen bg-[#090A0C] font-sans text-[#F4F4F6]" data-testid="rider-landing">
      {/* ---------- nav ---------- */}
      <header className="sticky top-0 z-50 border-b border-[#1B1F2A]/80 bg-[#090A0C]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Link to="/" className="flex items-center gap-2.5" data-testid="landing-logo">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#F5D061] to-[#C5A25D] text-[#0B0C10] shadow-[0_6px_20px_-6px_rgba(212,175,55,0.7)]">
              <CarFront size={18} strokeWidth={2.6} />
            </div>
            <div>
              <p className="font-heading text-[16px] leading-none font-bold tracking-tight">Wheelind</p>
              <p className="mt-1 text-[9px] tracking-[0.18em] text-[#C5A25D] uppercase">
                Your ride, our pride
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-[13px] text-[#9BA1B0] md:flex">
            <a href="#services" className="transition-colors duration-150 hover:text-white">Services</a>
            <a href="#how" className="transition-colors duration-150 hover:text-white">How it works</a>
            <a href="#safety" className="transition-colors duration-150 hover:text-white">Safety</a>
            <a href="#offers" className="transition-colors duration-150 hover:text-white">Offers</a>
            <a href="#captains" className="transition-colors duration-150 hover:text-white">Drive with us</a>
          </nav>

          <Link
            to={bookHref}
            data-testid="landing-nav-cta"
            className="group flex items-center gap-1.5 rounded-full bg-[#D4AF37] px-4 py-2 text-[13px] font-semibold text-[#0B0C10] transition-colors duration-150 hover:bg-[#E5C158]"
          >
            <Download size={14} />
            Download app
          </Link>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden">
        <img src={HERO_IMG} alt="Kolkata taxi under Howrah bridge" className="absolute inset-0 h-full w-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090A0C] via-[#090A0C]/92 to-[#090A0C]/40" />
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#D4AF37]/12 blur-[100px]" />

        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pt-16 pb-20 md:grid-cols-[1.15fr_0.85fr] md:pt-24 md:pb-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1.5">
              <Sparkles size={12} className="text-[#F5D061]" />
              <span className="text-[11px] font-semibold tracking-[0.14em] text-[#F5D061] uppercase">
                Now live in Kolkata
              </span>
            </div>

            <h1 className="font-heading mt-6 text-[40px] leading-[1.05] font-bold tracking-tight sm:text-[52px] md:text-[60px]">
              Kolkata moves.
              <br />
              <span className="bg-gradient-to-r from-[#F5D061] via-[#D4AF37] to-[#C5A25D] bg-clip-text text-transparent">
                We move with it.
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#9BA1B0]">
              Bikes, autos, cabs, XL, rentals, outstation and parcels — one app, upfront fares and
              OTP-verified trips. Built here, for the way this city actually rides.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to={bookHref}
                data-testid="landing-hero-book"
                className="group flex items-center gap-2 rounded-xl bg-[#D4AF37] px-6 py-3.5 text-[15px] font-semibold text-[#0B0C10] shadow-[0_14px_40px_-14px_rgba(212,175,55,0.85)] transition-colors duration-150 hover:bg-[#E5C158]"
              >
                Book a ride
                <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <a
                href="#captains"
                data-testid="landing-hero-captain"
                className="rounded-xl border border-[#2A303F] px-6 py-3.5 text-[15px] font-semibold text-[#E6E8EE] transition-colors duration-150 hover:border-[#D4AF37]/60 hover:text-white"
              >
                Drive with Wheelind
              </a>
            </div>

            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-4">
              {[
                ["3,000+", "rides a day"],
                ["4.8★", "average rating"],
                ["24×7", "safety desk"],
              ].map(([v, l]) => (
                <div key={l} className="border-l border-[#D4AF37]/35 pl-3">
                  <dt className="font-mono text-[22px] leading-none font-semibold text-[#F5D061]">{v}</dt>
                  <dd className="mt-1.5 text-[11px] tracking-wide text-[#7E8698] uppercase">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* fare preview card */}
          <div className="relative md:mt-6">
            <div className="rounded-2xl border border-[#232834] bg-[#11141A]/90 p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-md">
              <div className="flex items-center justify-between">
                <Overline>Sample fare</Overline>
                <span className="rounded-full bg-[#10B981]/12 px-2.5 py-1 text-[10px] font-semibold text-[#10B981]">
                  UPFRONT
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {[
                  ["Park Street", "Pickup"],
                  ["Salt Lake Sector V", "Drop"],
                ].map(([place, kind], i) => (
                  <div key={place} className="flex items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-[#10B981]" : "bg-[#D4AF37]"}`}
                    />
                    <div>
                      <p className="text-[13px] font-semibold text-white">{place}</p>
                      <p className="text-[10px] tracking-[0.14em] text-[#7E8698] uppercase">{kind}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-2 border-t border-[#232834] pt-4 text-[12px]">
                {[
                  ["Base + 11.4 km", "₹212"],
                  ["Time charge", "₹28"],
                  ["Taxes", "₹12"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-[#8E95A5]">{k}</span>
                    <span className="font-mono text-[#E6E8EE]">{v}</span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between border-t border-[#232834] pt-3">
                  <span className="text-[12px] font-semibold text-white">You pay</span>
                  <span className="font-mono text-[24px] font-semibold text-[#F5D061]">₹252</span>
                </div>
              </div>

              <Link
                to={bookHref}
                data-testid="landing-fare-cta"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D2330] py-3 text-[13px] font-semibold text-[#F5D061] transition-colors duration-150 hover:bg-[#262d3d]"
              >
                Get your fare estimate
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- services ---------- */}
      <section id="services" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
        <Overline>Eight ways to move</Overline>
        <h2 className="font-heading mt-2 max-w-2xl text-[30px] leading-tight font-bold tracking-tight sm:text-[36px]">
          Pick the ride that fits the moment
        </h2>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map(({ icon: Icon, name, blurb }) => (
            <div
              key={name}
              data-testid={`landing-service-${name.toLowerCase()}`}
              className={`group rounded-2xl border border-[#232834] bg-[#11141A] p-5 transition-[transform,border-color,background-color] duration-200 hover:-translate-y-1 hover:border-[#D4AF37]/45 hover:bg-[#161A22]`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D2330] text-[#F5D061] transition-colors duration-200 group-hover:bg-[#D4AF37] group-hover:text-[#0B0C10]">
                <Icon size={19} />
              </div>
              <p className="font-heading mt-4 text-[17px] font-semibold tracking-tight">{name}</p>
              <p className="mt-1 text-[12px] text-[#8E95A5]">{blurb}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how" className="scroll-mt-20 border-y border-[#1B1F2A] bg-[#0C0E13]">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-[0.9fr_1.1fr]">
          <div className="relative">
            <img
              src={RIDER_IMG}
              alt="Riders in city traffic"
              className="h-full max-h-[420px] w-full rounded-2xl object-cover"
            />
            <div className="absolute -right-4 bottom-6 hidden rounded-xl border border-[#232834] bg-[#11141A]/95 p-4 shadow-2xl backdrop-blur-md sm:block">
              <Overline>Matching</Overline>
              <p className="font-mono mt-1.5 text-[20px] font-semibold text-[#F5D061]">02:41</p>
              <p className="text-[11px] text-[#8E95A5]">search stops at 5 min</p>
            </div>
          </div>

          <div>
            <Overline>How it works</Overline>
            <h2 className="font-heading mt-2 text-[30px] leading-tight font-bold tracking-tight sm:text-[36px]">
              Three taps from kerb to destination
            </h2>
            <div className="mt-8 space-y-6">
              {STEPS.map((s) => (
                <div key={s.n} className="flex gap-5">
                  <span className="font-mono text-[13px] font-semibold text-[#D4AF37]">{s.n}</span>
                  <div className="border-l border-[#232834] pl-5">
                    <p className="font-heading text-[18px] font-semibold tracking-tight">{s.title}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[#8E95A5]">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- safety ---------- */}
      <section id="safety" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Overline>Safe rides · Reliable service · Customer first</Overline>
            <h2 className="font-heading mt-2 max-w-xl text-[30px] leading-tight font-bold tracking-tight sm:text-[36px]">
              Safety isn't a feature. It's the default.
            </h2>
          </div>
          <p className="max-w-sm text-[13px] leading-relaxed text-[#8E95A5]">
            Every captain is KYC-verified with documents reviewed by our Kolkata ops team before
            their first ride.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SAFETY.map(({ icon: Icon, t, d }) => (
            <div
              key={t}
              data-testid={`landing-safety-${t.split(" ")[0].toLowerCase()}`}
              className="rounded-2xl border border-[#232834] bg-gradient-to-b from-[#11141A] to-[#0D1015] p-5 transition-colors duration-200 hover:border-[#D4AF37]/40"
            >
              <Icon size={20} className="text-[#D4AF37]" />
              <p className="font-heading mt-4 text-[15px] font-semibold tracking-tight">{t}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#8E95A5]">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- offers ---------- */}
      <section id="offers" className="scroll-mt-20 border-y border-[#1B1F2A] bg-[#0C0E13]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="flex items-center gap-2">
            <Gift size={16} className="text-[#D4AF37]" />
            <Overline>Live offers</Overline>
          </div>
          <h2 className="font-heading mt-2 text-[30px] leading-tight font-bold tracking-tight sm:text-[36px]">
            Pujo deals, cashback and first-ride treats
          </h2>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {OFFERS.map((o) => (
              <div
                key={o.code}
                data-testid={`landing-offer-${o.code.toLowerCase()}`}
                className="relative overflow-hidden rounded-2xl border border-[#232834] bg-[#11141A] p-5"
              >
                <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-[#D4AF37]/8 blur-3xl" />
                <span className="relative rounded-full border border-[#D4AF37]/30 px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-[#F5D061] uppercase">
                  {o.tag}
                </span>
                <p className="font-heading relative mt-4 text-[20px] font-bold tracking-tight">{o.t}</p>
                <p className="relative mt-1.5 text-[12px] leading-relaxed text-[#8E95A5]">{o.d}</p>
                <p className="font-mono relative mt-4 text-[13px] tracking-[0.2em] text-[#D4AF37]">
                  {o.code}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-[#232834] bg-[#11141A] p-5">
            <Wallet size={20} className="text-[#D4AF37]" />
            <p className="flex-1 text-[13px] text-[#9BA1B0]">
              <span className="font-semibold text-white">Wheelind Wallet</span> — preload once, pay in
              a tap, and keep cashback, promo and your own money tracked separately in a real ledger.
            </p>
            <Link
              to={signedIn ? "/wallet" : "/ride"}
              data-testid="landing-wallet-cta"
              className="rounded-xl border border-[#2A303F] px-4 py-2.5 text-[13px] font-semibold text-[#F5D061] transition-colors duration-150 hover:border-[#D4AF37]/60"
            >
              Open wallet
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- captains ---------- */}
      <section id="captains" className="relative scroll-mt-20 overflow-hidden">
        <img src={CITY_IMG} alt="Kolkata street" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-l from-[#090A0C] via-[#090A0C]/93 to-[#090A0C]/70" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2">
          <div>
            <Overline>Drive with Wheelind</Overline>
            <h2 className="font-heading mt-2 text-[30px] leading-tight font-bold tracking-tight sm:text-[36px]">
              Keep more of every fare
            </h2>
            <p className="mt-4 max-w-md text-[14px] leading-relaxed text-[#9BA1B0]">
              Choose a straight commission plan, or take a zero-commission subscription pass — daily,
              weekly or monthly — and keep 100% of your ride earnings.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                [BadgeIndianRupee, "Daily payouts to your bank or UPI"],
                [Truck, "Bike, auto, cab, XL and parcel demand"],
                [HeartHandshake, "Pujo and peak-hour bonuses"],
                [Star, "Transparent ride-by-ride earnings breakup"],
              ].map(([Icon, text]) => {
                const I = Icon as typeof Star;
                return (
                  <li key={text as string} className="flex items-center gap-3 text-[13px] text-[#C2C7D4]">
                    <I size={15} className="text-[#D4AF37]" />
                    {text as string}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#232834] bg-[#11141A]/92 p-6 backdrop-blur-md">
            <Overline>Zero-commission pass</Overline>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-[38px] font-semibold text-[#F5D061]">₹49</span>
              <span className="text-[13px] text-[#8E95A5]">/ day</span>
            </div>
            <p className="mt-2 text-[12px] text-[#8E95A5]">
              Weekly ₹279 · Monthly ₹999 · category and zone rules set by ops.
            </p>
            <div className="mt-5 space-y-2.5 border-t border-[#232834] pt-5 text-[13px]">
              {["0% commission on eligible rides", "Incentives stack on top", "Cancel or switch anytime"].map(
                (b) => (
                  <p key={b} className="flex items-center gap-2 text-[#C2C7D4]">
                    <ShieldCheck size={14} className="text-[#10B981]" />
                    {b}
                  </p>
                ),
              )}
            </div>
            <p className="mt-5 rounded-xl bg-[#1D2330] px-4 py-3 text-[12px] text-[#9BA1B0]">
              Captain onboarding opens from the partner app — our Kolkata team verifies your documents
              within 24 hours.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- faq ---------- */}
      <section className="border-y border-[#1B1F2A] bg-[#0C0E13]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Overline>Questions</Overline>
            <h2 className="font-heading mt-2 text-[30px] leading-tight font-bold tracking-tight">
              Good to know before you ride
            </h2>
          </div>
          <div className="divide-y divide-[#1E222B]">
            {FAQ.map((f) => (
              <div key={f.q} className="py-5" data-testid="landing-faq-item">
                <p className="font-heading text-[16px] font-semibold tracking-tight">{f.q}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-[#8E95A5]">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- download ---------- */}
      <section id="download" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-4">
        <div className="grid gap-6 rounded-3xl border border-[#232834] bg-[#11141A] p-8 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <Overline>Get the app</Overline>
            <h2 className="font-heading mt-2 text-[28px] leading-tight font-bold tracking-tight">
              Wheelind in your pocket
            </h2>
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-[#8E95A5]">
              Faster booking, live tracking notifications and one-tap SOS. Android and iOS builds roll
              out with our Kolkata launch — book on the web meanwhile.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {["Android — coming soon", "iOS — coming soon"].map((s) => (
                <span
                  key={s}
                  data-testid={`landing-store-${s.split(" ")[0].toLowerCase()}`}
                  className="flex items-center gap-2 rounded-xl border border-[#2A303F] px-4 py-3 text-[13px] font-semibold text-[#C2C7D4]"
                >
                  <Download size={14} className="text-[#D4AF37]" />
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[#232834] bg-[#0D0F14] p-6">
            <p className="text-[12px] text-[#8E95A5]">
              No app needed today — the full booking journey, fare estimate, OTP trip start and wallet
              all work right here in the browser.
            </p>
            <Link
              to={bookHref}
              data-testid="landing-download-book"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1D2330] px-4 py-3 text-[13px] font-semibold text-[#F5D061] transition-colors duration-150 hover:bg-[#262d3d]"
            >
              Book on the web
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- final cta ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="relative overflow-hidden rounded-3xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#15120A] via-[#11141A] to-[#0C0E13] p-10">
          <div className="absolute -top-20 -right-10 h-64 w-64 rounded-full bg-[#D4AF37]/14 blur-[90px]" />
          <div className="relative max-w-xl">
            <h2 className="font-heading text-[32px] leading-tight font-bold tracking-tight sm:text-[40px]">
              Your ride, our pride.
            </h2>
            <p className="mt-3 text-[14px] text-[#9BA1B0]">
              Book in seconds, pay how you like, and know exactly what you'll be charged before you
              step in.
            </p>
            <Link
              to={bookHref}
              data-testid="landing-final-cta"
              className="group mt-7 inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-6 py-3.5 text-[15px] font-semibold text-[#0B0C10] transition-colors duration-150 hover:bg-[#E5C158]"
            >
              Book a ride now
              <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="border-t border-[#1B1F2A] bg-[#090A0C]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-10">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D4AF37] text-[#0B0C10]">
                <CarFront size={16} strokeWidth={2.6} />
              </div>
              <p className="font-heading text-[15px] font-bold tracking-tight">Wheelind</p>
            </div>
            <p className="mt-2 text-[12px] text-[#7E8698]">
              Kolkata, West Bengal · Safe Rides · Reliable Service · Customer First
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-[12px] text-[#7E8698]">
            <Link to={bookHref} className="transition-colors duration-150 hover:text-white">
              Book a ride
            </Link>
            <a href="#captains" className="transition-colors duration-150 hover:text-white">
              Drive with us
            </a>
            <a
              href="/admin"
              data-testid="admin-portal-link"
              className="transition-colors duration-150 hover:text-[#F5D061]"
            >
              Staff console
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
