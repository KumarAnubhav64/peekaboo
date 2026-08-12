import { Link } from "react-router-dom";
import {
  ArrowRight,
  CaretRight,
  Check,
  CloudArrowUp,
  Heart,
  MapPin,
  MagnifyingGlass,
  Mountains,
  Shapes,
  Sparkle,
  Users,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LandingMock } from "@/components/LandingMock";
import { useAuth } from "@/auth";

const SECTION_LINK =
  "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

/* --------------------------------- hero --------------------------------- */

function Hero() {
  const { user } = useAuth();

  return (
    <section className="relative overflow-hidden">
      {/* warm, light wash — personal-photo app, not a dark devtool */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_28rem_at_50%_-6rem,oklch(0.92_0.06_90/0.55),transparent_70%)]"
      />
      <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-16 text-center sm:pt-24">
        <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
          <Sparkle className="h-3 w-3 text-primary" weight="fill" />
          Now classifying by face, place, and object
        </Badge>

        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
          Find any photo in seconds,{" "}
          <span className="text-primary">without ever naming a folder</span>.
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          Peekaboo reads every photo you upload — who&rsquo;s in it, where it was taken,
          what&rsquo;s in the frame — then lets you search in plain words.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="gap-2 rounded-full px-6">
            <Link to={user ? "/photos" : "/auth"}>
              {user ? "Open your library" : "Try it free"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="gap-2 rounded-full px-6"
          >
            <a href="#how-it-works">
              See how it works
              <CaretRight className="h-4 w-4" />
            </a>
          </Button>
        </div>

        {/* the real product, not an illustration */}
        <div className="relative mt-14 text-left">
          {/* callouts */}
          <div className="absolute -left-4 top-24 z-10 hidden items-center gap-2 rounded-xl border bg-card px-3 py-2 text-xs font-medium shadow-lg lg:flex">
            <Users className="h-4 w-4 text-primary" />
            Faces grouped into people — automatically
          </div>
          <div className="absolute -right-4 top-40 z-10 hidden items-center gap-2 rounded-xl border bg-card px-3 py-2 text-xs font-medium shadow-lg lg:flex">
            <MagnifyingGlass className="h-4 w-4 text-primary" />
            Type “beach” — get beaches
          </div>
          <LandingMock />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- bento grid ----------------------------- */

const TILES = [
  {
    icon: Users,
    title: "People",
    body: "Every face becomes a person. One glance shows everyone in your library, and a tap filters to just them.",
    visual: (
      <div className="flex items-center justify-center gap-2 rounded-xl bg-muted/60 px-3 py-4">
        {["from-indigo-400 to-indigo-600", "from-amber-400 to-rose-500", "from-emerald-400 to-teal-600", "from-sky-400 to-blue-600"].map(
          (g, i) => (
            <span
              key={i}
              className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ${g} text-[11px] font-bold text-white shadow-sm`}
            >
              {["J", "M", "A", "S"][i]}
            </span>
          ),
        )}
        <span className="ml-1 rounded-full border px-2 py-1 text-[10px] font-medium text-muted-foreground">
          Person 1 · 42
        </span>
      </div>
    ),
  },
  {
    icon: MapPin,
    title: "Places",
    body: "Phone photos carry GPS. Peekaboo groups them by where they were taken — and reads the scene when there’s no GPS.",
    visual: (
      <div className="space-y-1.5 rounded-xl bg-muted/60 px-3 py-4">
        <div className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[11px] font-medium">
          <MapPin className="h-3 w-3 text-primary" /> 28.6140, 77.2090
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[11px] font-medium">
          <Mountains className="h-3 w-3 text-primary" /> Beach · detected scene
        </div>
      </div>
    ),
  },
  {
    icon: Shapes,
    title: "Things & animals",
    body: "Dogs, cars, receipts, surfboards — every object is tagged as it uploads, so nothing needs hand-labeling.",
    visual: (
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted/60 px-3 py-4">
        {["dog", "car", "pizza", "snowboard", "book"].map((t) => (
          <span key={t} className="rounded-full bg-card px-2.5 py-1 text-[11px] font-medium capitalize">
            {t}
          </span>
        ))}
      </div>
    ),
  },
  {
    icon: MagnifyingGlass,
    title: "Natural search",
    body: "Search by person, place, or object — “mom”, “beach”, “receipts”. No folders, no file names to remember.",
    visual: (
      <div className="rounded-xl bg-muted/60 px-3 py-4">
        <div className="flex items-center gap-2 rounded-full bg-card px-3 py-2 text-[11px] text-muted-foreground">
          <MagnifyingGlass className="h-3.5 w-3.5 text-primary" />
          Search “beach”
          <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">3 photos</span>
        </div>
      </div>
    ),
  },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-20">
      <p className="text-center text-xs font-semibold uppercase tracking-widest text-primary">Features</p>
      <h2 className="mt-2 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        Four ways to find a photo
      </h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {TILES.map(({ icon: Icon, title, body, visual }) => (
          <div
            key={title}
            className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="text-lg font-semibold">{title}</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
            <div className="mt-4">{visual}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ how it works ----------------------------- */

const STEPS = [
  {
    icon: CloudArrowUp,
    title: "Upload your photos",
    body: "Drag in a whole trip or a single shot. Detection runs in the background — the page never blocks.",
  },
  {
    icon: Sparkle,
    title: "AI groups them automatically",
    body: "Faces become people, GPS becomes places, objects become tags — all before you do anything.",
  },
  {
    icon: MagnifyingGlass,
    title: "Search naturally",
    body: "Type “beach”, “mom”, or “receipts”. The answer is instant, because your library already knows.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-y bg-card/60">
      <div className="mx-auto max-w-5xl px-4 py-20">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-primary">How it works</p>
        <h2 className="mt-2 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Upload once. Find anything, forever.
        </h2>
        <div className="mt-12 grid gap-10 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="relative text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-7 w-7" />
              </div>
              <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- use cases ------------------------------ */

const CASES = [
  {
    emoji: "🎓",
    title: "Built for students",
    body: "Years of camera-roll chaos — lecture slides, group trips, dorm life. Find the photo that matters before your deadline.",
  },
  {
    emoji: "📷",
    title: "For photographers",
    body: "Hand-tagging 10,000 shots is nobody’s idea of a good time. Let the library organize itself; you keep the shots.",
  },
  {
    emoji: "👨‍👩‍👧",
    title: "For families",
    body: "Everyone has a folder of the same day. Peekaboo’s claim links mean each person can find themselves — and only themselves.",
  },
];

function UseCases() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20">
      <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        Made for people with too many photos
      </h2>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {CASES.map((c) => (
          <div key={c.title} className="rounded-2xl border bg-card p-6 text-center transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5">
            <span className="text-3xl">{c.emoji}</span>
            <h3 className="mt-3 text-base font-semibold">{c.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------- pricing ------------------------------- */

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-y bg-card/60">
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Pricing</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Free. Forever.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          No trials, no tiers, no credit card. Peekaboo runs on free-tier services, so it stays $0.
        </p>

        <div className="mx-auto mt-10 max-w-sm rounded-3xl border bg-card p-8 shadow-xl shadow-primary/5">
          <p className="text-5xl font-semibold tracking-tight">
            $0<span className="text-lg font-normal text-muted-foreground">/month</span>
          </p>
          <p className="mt-1 text-sm font-medium text-primary">Everything included</p>
          <ul className="mt-6 space-y-3 text-left text-sm">
            {[
              "Your own private, multi-tenant library",
              "People, Places & Things views",
              "A private claim link for every person in your photos",
              "Natural search across faces, scenes and objects",
              "100% free-tier stack — nothing to pay, ever",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Check className="h-3 w-3 text-primary" weight="bold" />
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Button asChild size="lg" className="mt-7 w-full gap-2 rounded-full">
            <Link to="/auth">
              Create your free account
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- final CTA ------------------------------ */

function FinalCta() {
  const { user } = useAuth();
  return (
    <section className="mx-auto max-w-5xl px-4 py-24 text-center">
      <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
        Your photos already know what they are.
        <br />
        <span className="text-primary">Now you do too.</span>
      </h2>
      <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
        Upload a few photos and watch the library organize itself into people, places, and things.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg" className="gap-2 rounded-full px-8">
          <Link to={user ? "/photos" : "/auth"}>
            {user ? "Open your library" : "Try it free"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/* --------------------------------- footer -------------------------------- */

function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="text-xl">🫣</span>
          <span className="text-sm font-semibold tracking-tight">Peekaboo</span>
          <span className="ml-2 text-xs text-muted-foreground">© 2026</span>
        </div>
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#how-it-works" className="hover:text-foreground">How it works</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <Link to="/auth" className="hover:text-foreground">Sign in</Link>
        </nav>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Built free with <Heart className="h-3.5 w-3.5 text-rose-500" weight="fill" /> on Neon, on-device AI &amp; open models
        </p>
      </div>
    </footer>
  );
}

/* ---------------------------------- page --------------------------------- */

export default function LandingPage() {
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* nav */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl">🫣</span>
            <span className="text-[15px] font-semibold tracking-tight">Peekaboo</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-5 sm:flex">
            <a href="#features" className={SECTION_LINK}>Features</a>
            <a href="#how-it-works" className={SECTION_LINK}>How it works</a>
            <a href="#pricing" className={SECTION_LINK}>Pricing</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {!loading && (
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                <Link to={user ? "/photos" : "/auth"}>{user ? "Open library" : "Sign in"}</Link>
              </Button>
            )}
            <Button asChild size="sm" className="gap-1.5 rounded-full">
              <Link to={user ? "/photos" : "/auth"}>
                {user ? "Library" : "Try it free"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <UseCases />
        <Pricing />
        <FinalCta />
      </main>

      <Footer />
    </div>
  );
}
