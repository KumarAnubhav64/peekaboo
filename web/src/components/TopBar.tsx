import { useMemo, useState } from "react";
import {
  MagnifyingGlass,
  MapPin,
  Shapes,
  SlidersHorizontal,
  Users,
  X,
  XCircle,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useLibrary, type DateFilter } from "@/lib/library-context";
import { personLabel, sortedPeople } from "@/lib/filter";
import { cn } from "@/lib/utils";

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "this-year", label: "This year" },
];

export function TopBar() {
  const { data, filters, setPerson, setPlace, setThing, setDate, setQuery, clearFilters, analyzing, queue } =
    useLibrary();
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const people = useMemo(() => sortedPeople(data), [data]);
  const places = useMemo(() => data?.places ?? [], [data]);
  const things = useMemo(() => data?.things ?? [], [data]);

  const dateLabel = DATE_OPTIONS.find((d) => d.value === filters.date)?.label;
  const activePerson = people.find((p) => p.id === filters.personId);
  const activePlace = places.find((p) => p.id === filters.placeId);
  const hasFilters =
    filters.personId !== null ||
    filters.placeId !== null ||
    filters.thing !== null ||
    filters.date !== "any" ||
    !!filters.q;

  return (
    <header className="border-b bg-card/70 backdrop-blur sticky top-0 z-30">
      <div className="flex items-center gap-2 px-4 py-2.5">
        {/* Search trigger — opens the command palette */}
        <Button
          variant="outline"
          className="w-full max-w-sm justify-start text-muted-foreground"
          onClick={() => setSearchOpen(true)}
        >
          <MagnifyingGlass className="h-4 w-4" />
          Search by person, place, or object
          <kbd className="ml-auto rounded border bg-muted px-1.5 text-[10px] font-medium">⌘K</kbd>
        </Button>

        {/* Filter popover */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={hasFilters ? "default" : "outline"}
              size="icon"
              className="shrink-0"
              aria-label="Filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Date
            </p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {DATE_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDate(d.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filters.date === d.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <Separator className="mb-3" />

            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              People
            </p>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {people.length === 0 && (
                <p className="text-xs text-muted-foreground">No people detected yet.</p>
              )}
              {people.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setPerson(filters.personId === p.id ? null : p.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filters.personId === p.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {personLabel(i)} · {p.count}
                </button>
              ))}
            </div>

            <Separator className="mb-3" />

            <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3 w-3" /> Places
            </p>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {places.length === 0 && (
                <p className="text-xs text-muted-foreground">No places detected yet.</p>
              )}
              {places.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => setPlace(filters.placeId === pl.id ? null : pl.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filters.placeId === pl.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {pl.label} · {pl.count}
                </button>
              ))}
            </div>

            <Separator className="mb-3" />

            <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Shapes className="h-3 w-3" /> Things
            </p>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {things.length === 0 && (
                <p className="text-xs text-muted-foreground">No objects detected yet.</p>
              )}
              {things.map((t) => (
                <button
                  key={t.label}
                  onClick={() => setThing(filters.thing === t.label ? null : t.label)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                    filters.thing === t.label
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {t.label} · {t.count}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Analyzing banner — non-blocking */}
        {analyzing && (
          <div className="ml-2 flex shrink-0 items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Analyzing {queue.length} photo{queue.length === 1 ? "" : "s"}…
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              <XCircle className="h-4 w-4" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Active filters as removable badges */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2.5">
          {activePerson && (
            <Badge variant="secondary" className="gap-1">
              {personLabel(people.indexOf(activePerson))}
              <button onClick={() => setPerson(null)} aria-label="Remove person filter">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {activePlace && (
            <Badge variant="secondary" className="gap-1">
              <MapPin className="h-3 w-3" />
              {activePlace.label}
              <button onClick={() => setPlace(null)} aria-label="Remove place filter">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.thing && (
            <Badge variant="secondary" className="gap-1 capitalize">
              <Shapes className="h-3 w-3" />
              {filters.thing}
              <button onClick={() => setThing(null)} aria-label="Remove object filter">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.date !== "any" && (
            <Badge variant="secondary" className="gap-1">
              {dateLabel}
              <button onClick={() => setDate("any")} aria-label="Remove date filter">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.q && (
            <Badge variant="secondary" className="gap-1">
              “{filters.q}”
              <button onClick={() => setQuery("")} aria-label="Clear search">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Search command palette */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search by person, place, or object…" />
        <CommandList>
          <CommandEmpty>No results found</CommandEmpty>
          <CommandGroup heading="People">
            {people.map((p, i) => (
              <CommandItem
                key={p.id}
                value={`${personLabel(i)} ${p.count}`}
                onSelect={() => {
                  setPerson(p.id);
                  setSearchOpen(false);
                }}
              >
                <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-muted">
                  {p.avatar ? (
                    <img src={p.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Users className="h-3.5 w-3.5" />
                  )}
                </span>
                {personLabel(i)}
                <span className="ml-auto text-xs text-muted-foreground">{p.count} photos</span>
              </CommandItem>
            ))}
            {people.length === 0 && (
              <CommandItem disabled>No people detected yet — upload a photo!</CommandItem>
            )}
          </CommandGroup>
          <CommandGroup heading="Places &amp; things">
            {places.map((pl) => (
              <CommandItem
                key={pl.id}
                value={`${pl.label} ${pl.sub}`}
                onSelect={() => {
                  setPlace(pl.id);
                  setSearchOpen(false);
                }}
              >
                <MapPin className="h-4 w-4" />
                {pl.label}
                <span className="ml-auto text-xs text-muted-foreground">
                  {pl.count} photo{pl.count === 1 ? "" : "s"}
                </span>
              </CommandItem>
            ))}
            {things.map((t) => (
              <CommandItem
                key={t.label}
                value={t.label}
                onSelect={() => {
                  setThing(t.label);
                  setSearchOpen(false);
                }}
              >
                <Shapes className="h-4 w-4" />
                <span className="capitalize">{t.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t.count} photo{t.count === 1 ? "" : "s"}
                </span>
              </CommandItem>
            ))}
            {places.length === 0 && things.length === 0 && (
              <CommandItem disabled>No places or objects detected yet</CommandItem>
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}
