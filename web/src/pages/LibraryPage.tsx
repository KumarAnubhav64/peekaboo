import { useEffect, useMemo, useState } from "react";
import { Camera, Check, FolderOpen, LinkSimple, Trash, X } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FaceStrip } from "@/components/FaceStrip";
import { Lightbox } from "@/components/Lightbox";
import { EmptyState } from "@/components/EmptyState";
import { UploadDialog } from "@/components/UploadDialog";
import { useLibrary } from "@/lib/library-context";
import { filterPhotos, groupByDay, sortedPeople } from "@/lib/filter";
import { copyText, type LibraryPhoto } from "@/api";
import { cn } from "@/lib/utils";

export default function LibraryPage() {
  const { data, loading, error, refresh, upload, filters, setPerson, clearFilters } = useLibrary();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<LibraryPhoto | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastAnchor, setLastAnchor] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(new Set());
        setLightbox(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const people = useMemo(() => sortedPeople(data), [data]);
  const photos = useMemo(() => (data ? filterPhotos(data, filters) : []), [data, filters]);
  const groups = useMemo(() => groupByDay(photos), [photos]);

  // face id -> person index (for lightbox chips)
  const peopleByFace = useMemo(() => {
    const m = new Map<string, number>();
    people.forEach((p, i) => p.face_ids.forEach((fid) => m.set(fid, i)));
    return m;
  }, [people]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  /* ------------------------------ selection ------------------------------ */
  const toggle = (id: string, e: React.MouseEvent) => {
    const ids = photos.map((p) => p.id);
    const idx = ids.indexOf(id);
    const next = new Set(selected);
    if (e.shiftKey && lastAnchor && idx >= 0) {
      const a = ids.indexOf(lastAnchor);
      if (a >= 0) {
        const [lo, hi] = a < idx ? [a, idx] : [idx, a];
        ids.slice(lo, hi + 1).forEach((i) => next.add(i));
        setLastAnchor(id);
      } else {
        // anchor fell out of the filtered list — treat as a plain toggle
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setLastAnchor(id);
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setLastAnchor(id);
    } else {
      next.add(id);
      setLastAnchor(id);
    }
    setSelected(next);
  };

  const openPhoto = (p: LibraryPhoto) => {
    setSelected(new Set());
    setLightbox(p);
  };

  const copyLinks = async () => {
    const links = photos
      .filter((p) => selected.has(p.id) && p.share_url)
      .map((p) => `${window.location.origin}${p.share_url}`);
    if (links.length === 0) return;
    await copyText(links.join("\n"));
    showToast(`Copied ${links.length} claim link${links.length === 1 ? "" : "s"}`);
  };

  /* --------------------------------- states ------------------------------ */
  if (loading) {
    return (
      <div className="px-4 py-4">
        <div className="mb-4 flex gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-11 w-11 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {[...Array(12)].map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={Camera}
        title="Couldn't load your library"
        description={error}
        actionLabel="Try again"
        onAction={() => refresh()}
      />
    );
  }

  if (data && data.photos.length === 0) {
    return (
      <UploadDialog onFiles={upload}>
        <div className="cursor-pointer">
          <EmptyState
            icon={Camera}
            title="No photos yet"
            description="Upload your first photo and Peekaboo will detect every face, mint a private claim link per person, and group your library automatically."
            actionLabel="Upload photos"
          />
        </div>
      </UploadDialog>
    );
  }

  /* --------------------------------- view -------------------------------- */
  return (
    <div className="pb-24">
      <FaceStrip />

      {/* Active person badge under the strip */}
      {filters.personId && (
        <div className="px-4 pb-2">
          <Badge variant="secondary" className="gap-1.5">
            Showing one person
            <button onClick={() => setPerson(null)} aria-label="Clear person filter">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}

      {photos.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No photos match"
          description="Try adjusting the search or filters."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      ) : (
        groups.map(([label, groupPhotos]) => (
          <section key={label} className="px-4 pt-4">
            <h2 className="section-date sticky top-0 z-10 mb-2 bg-background/90 py-1 backdrop-blur">
              {label} · {groupPhotos.length}
            </h2>
            {/* CSS-columns masonry: cells keep their own aspect ratio (the
                spec's no-crop rule) — grid rows would stretch and crop. */}
            <div className="columns-2 gap-2 sm:columns-3 lg:columns-4 xl:columns-5">
              {groupPhotos.map((p) => {
                const isSel = selected.has(p.id);
                const ratio = p.height && p.width ? p.height / p.width : 1;
                return (
                  <div
                    key={p.id}
                    className="photo-cell group mb-2 break-inside-avoid"
                    style={{ aspectRatio: `1 / ${ratio}` }}
                    onClick={(e) => {
                      if (e.shiftKey || e.ctrlKey || e.metaKey || selected.size > 0) toggle(p.id, e);
                      else openPhoto(p);
                    }}
                  >
                    {p.thumb ? (
                      <img src={p.thumb} alt={p.original_name} loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-muted">
                        <Camera className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    {/* hover / selected checkbox */}
                    <span
                      className={cn(
                        "absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border bg-background/80 opacity-0 transition-opacity group-hover:opacity-100",
                        isSel && "border-primary bg-primary opacity-100 text-primary-foreground",
                      )}
                    >
                      {isSel && <Check className="h-3.5 w-3.5" />}
                    </span>
                    {isSel && (
                      <span className="absolute inset-0 rounded-lg ring-2 ring-inset ring-primary" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {/* Floating selection action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-card px-2 py-1.5 shadow-xl">
          <span className="px-2 text-sm font-medium">{selected.size} selected</span>
          <Button variant="ghost" size="sm" onClick={copyLinks} className="gap-1.5">
            <LinkSimple className="h-4 w-4" /> Copy links
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => showToast("Albums are coming soon")}
          >
            <FolderOpen className="h-4 w-4" /> Album
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => showToast("Delete is coming soon")}
          >
            <Trash className="h-4 w-4" /> Delete
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSelected(new Set())}
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Lightbox
        photo={lightbox}
        onClose={() => setLightbox(null)}
        people={people}
        peopleByFace={peopleByFace}
        onCopy={(_t, label) => showToast(label === "share" ? "Claim link copied!" : "Copied")}
      />

      {/* toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg border bg-card px-4 py-2.5 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
