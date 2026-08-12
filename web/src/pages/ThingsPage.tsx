import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Cat, Shapes } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { UploadDialog } from "@/components/UploadDialog";
import { useLibrary } from "@/lib/library-context";
import { ANIMAL_LABELS } from "@/lib/filter";

export default function ThingsPage() {
  const { data, loading, upload, setThing } = useLibrary();
  const navigate = useNavigate();

  const things = useMemo(() => data?.things ?? [], [data]);
  const animals = things.filter((t) => ANIMAL_LABELS.has(t.label));
  const others = things.filter((t) => !ANIMAL_LABELS.has(t.label));

  if (loading) {
    return (
      <div className="px-6 py-6">
        <Skeleton className="mb-5 h-6 w-40" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.photos.length === 0) {
    return (
      <UploadDialog onFiles={upload}>
        <div className="cursor-pointer">
          <EmptyState
            icon={Shapes}
            title="No things yet"
            description="Upload photos and Peekaboo will tag the objects in them — people, animals, vehicles, furniture and more — so you can filter your library by what's in the picture."
            actionLabel="Upload photos"
          />
        </div>
      </UploadDialog>
    );
  }

  if (things.length === 0) {
    return (
      <EmptyState
        icon={Shapes}
        title="No objects detected"
        description="The classifier couldn't identify objects in your photos yet. Try uploading photos with clear subjects — animals, vehicles, or furniture."
        actionLabel="Back to photos"
        onAction={() => navigate("/photos")}
      />
    );
  }

  const renderGrid = (items: typeof things, Icon: typeof Shapes) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((t) => (
        <button
          key={t.label}
          onClick={() => {
            setThing(t.label);
            navigate("/photos");
          }}
          className="group flex items-center gap-3 rounded-xl border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="h-5 w-5" weight="fill" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold capitalize">
              {t.label}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t.count} photo{t.count === 1 ? "" : "s"}
            </span>
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="px-6 py-6">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Things</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {things.length} object type{things.length === 1 ? "" : "s"} detected in your library
      </p>

      {animals.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Cat className="h-4 w-4 text-primary" /> Animals
          </h2>
          {renderGrid(animals, Cat)}
        </section>
      )}

      {others.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Shapes className="h-4 w-4 text-primary" /> Objects &amp; vehicles
          </h2>
          {renderGrid(others, Shapes)}
        </section>
      )}
    </div>
  );
}
