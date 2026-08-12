import { useMemo, useState } from "react";
import { Check, MagnifyingGlass, Users, X, XCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import obama from "@/assets/samples/obama.jpg";
import obama2 from "@/assets/samples/obama2.jpg";
import biden from "@/assets/samples/biden.jpg";
import twoPeople from "@/assets/samples/two_people.jpg";

/* ------------------------------- demo data ------------------------------ */

interface MockFace {
  id: string;
  label: string;
  src: string;
  pos: string; // object-position for the avatar crop
}

const FACES: MockFace[] = [
  { id: "p1", label: "Person 1", src: twoPeople, pos: "12% 35%" },
  { id: "p2", label: "Person 2", src: twoPeople, pos: "88% 35%" },
  { id: "p3", label: "Person 3", src: obama, pos: "center 25%" },
  { id: "p4", label: "Person 4", src: biden, pos: "center 25%" },
];

interface MockPhoto {
  id: string;
  src: string;
  pos: string;
  ratio: number; // height / width
  alt: string;
  scene: string;
  tags: string[];
  people: string[];
}

const PHOTOS: MockPhoto[] = [
  { id: "a", src: twoPeople, pos: "center 60%", ratio: 0.62, alt: "Beach trip", scene: "Beach", tags: ["beach", "sun"], people: ["p1", "p2"] },
  { id: "b", src: obama, pos: "center top", ratio: 1.25, alt: "Oval office portrait", scene: "Office", tags: ["portrait", "suit"], people: ["p3"] },
  { id: "c", src: twoPeople, pos: "25% 60%", ratio: 0.72, alt: "Golden hour", scene: "Golden hour", tags: ["beach", "sunset"], people: ["p1"] },
  { id: "d", src: obama2, pos: "center 30%", ratio: 0.95, alt: "Keynote", scene: "Conference", tags: ["podium", "crowd"], people: ["p3"] },
  { id: "e", src: biden, pos: "center 40%", ratio: 1.05, alt: "Press event", scene: "Press event", tags: ["podium", "flag"], people: ["p4"] },
  { id: "f", src: obama, pos: "center 55%", ratio: 0.85, alt: "Studio", scene: "Studio", tags: ["portrait"], people: ["p3"] },
  { id: "g", src: twoPeople, pos: "75% 60%", ratio: 0.68, alt: "Sunset stroll", scene: "Sunset", tags: ["beach", "sunset"], people: ["p2"] },
  { id: "h", src: biden, pos: "center 65%", ratio: 0.9, alt: "Town hall", scene: "Town hall", tags: ["microphone", "crowd"], people: ["p4"] },
];

const personLabel = (id: string) => FACES.find((f) => f.id === id)?.label ?? id;

/* --------------------------------- mock --------------------------------- */

export function LandingMock() {
  const [q, setQ] = useState("");
  const [person, setPerson] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return PHOTOS.filter((p) => {
      if (person && !p.people.includes(person)) return false;
      if (tag && !p.tags.includes(tag)) return false;
      if (query) {
        const hay = [p.alt, p.scene, ...p.tags, ...p.people.map(personLabel)]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [q, person, tag]);

  const activeCount =
    (person ? 1 : 0) + (tag ? 1 : 0) + (q.trim() ? 1 : 0);
  const clearAll = () => {
    setQ("");
    setPerson(null);
    setTag(null);
  };

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-primary/10">
      {/* browser chrome */}
      <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="mx-auto flex items-center gap-1.5 rounded-md bg-card px-3 py-1 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          peekaboo.app/photos
        </span>
        <span className="w-12" />
      </div>

      <div className="bg-gradient-to-b from-background to-card p-4 sm:p-6">
        {/* search bar — live */}
        <div className="relative mx-auto max-w-md">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search photos"
            placeholder="Search by person, place, or object…"
            className="w-full rounded-full border bg-card py-2.5 pl-9 pr-9 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* face strip */}
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => setPerson(null)}
            aria-pressed={person === null}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl px-1 py-1 transition-transform hover:-translate-y-0.5",
              person === null && "opacity-100",
              person !== null && "opacity-50",
            )}
            title="Everyone"
          >
            <span
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full border-2 bg-muted text-sm font-semibold",
                person === null ? "border-primary text-primary" : "border-border",
              )}
            >
              <Users className="h-5 w-5" />
            </span>
            <span className="text-[10px] text-muted-foreground">Everyone</span>
          </button>
          {FACES.map((f) => (
            <button
              key={f.id}
              onClick={() => setPerson(person === f.id ? null : f.id)}
              aria-pressed={person === f.id}
              className="flex flex-col items-center gap-1 rounded-xl px-1 py-1 transition-transform hover:-translate-y-0.5"
              title={f.label}
            >
              <span
                className={cn(
                  "h-12 w-12 overflow-hidden rounded-full border-2 transition-all",
                  person === f.id ? "border-primary ring-2 ring-primary/25" : "border-border opacity-80 hover:opacity-100",
                )}
              >
                <img src={f.src} alt="" className="h-full w-full object-cover" style={{ objectPosition: f.pos }} />
              </span>
              <span className="text-[10px] text-muted-foreground">{f.label}</span>
            </button>
          ))}
        </div>

        {/* filter hint */}
        <div className="mx-auto mt-3 flex max-w-md items-center justify-between text-[11px] text-muted-foreground">
          <span>
            Showing {filtered.length} of {PHOTOS.length} photo{PHOTOS.length === 1 ? "" : "s"}
            {q.trim() && (
              <>
                {" "}for “<span className="text-foreground">{q.trim()}</span>”
              </>
            )}
            {person && <> · {personLabel(person)}</>}
            {tag && <> · “{tag}”</>}
          </span>
          {activeCount > 0 && (
            <button onClick={clearAll} className="flex items-center gap-1 font-medium text-primary hover:underline">
              <XCircle className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>

        {/* masonry grid */}
        <div key={`${q}-${person}-${tag}`} className="mock-fade mt-4 columns-2 gap-2 sm:columns-3">
          {filtered.map((p) => (
            <figure key={p.id} className="mb-2 break-inside-avoid">
              <div
                className="overflow-hidden rounded-xl bg-muted"
                style={{ aspectRatio: `1 / ${p.ratio}` }}
              >
                <img
                  src={p.src}
                  alt={p.alt}
                  loading="lazy"
                  className="h-full w-full object-cover"
                  style={{ objectPosition: p.pos }}
                />
              </div>
              <figcaption className="mt-1.5 flex flex-wrap items-center gap-1 px-0.5">
                <span className="text-[11px] font-semibold">{p.alt}</span>
                <button
                  onClick={() => setTag(tag === p.scene.toLowerCase() ? null : p.scene.toLowerCase())}
                  aria-pressed={tag === p.scene.toLowerCase()}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                    tag === p.scene.toLowerCase()
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {p.scene}
                </button>
                {p.tags.slice(0, 2).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTag(tag === t ? null : t)}
                    aria-pressed={tag === t}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors",
                      tag === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </figcaption>
            </figure>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              <Check className="h-5 w-5 opacity-40" />
              No photos match — try “beach”
              <button className="text-primary hover:underline" onClick={clearAll}>
                Reset the demo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
