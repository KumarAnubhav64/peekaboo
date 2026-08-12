import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, MapPin, Mountains } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { UploadDialog } from "@/components/UploadDialog";
import { useLibrary } from "@/lib/library-context";
import { cn } from "@/lib/utils";

export default function PlacesPage() {
  const { data, loading, upload, setPlace } = useLibrary();
  const navigate = useNavigate();

  const places = useMemo(() => data?.places ?? [], [data]);
  const gpsCount = places.filter((p) => p.kind === "gps").length;
  const sceneCount = places.length - gpsCount;

  if (loading) {
    return (
      <div className="px-6 py-6">
        <Skeleton className="mb-5 h-6 w-40" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
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
            icon={MapPin}
            title="No places yet"
            description="Upload photos with location metadata (phone photos usually have it) and Peekaboo will group them by where they were taken. Photos without GPS get a detected scene label instead."
            actionLabel="Upload photos"
          />
        </div>
      </UploadDialog>
    );
  }

  if (places.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="No places detected"
        description="Your photos don't carry GPS coordinates and the scene classifier couldn't identify them. Upload photos taken with a phone camera for location grouping."
        actionLabel="Back to photos"
        onAction={() => navigate("/photos")}
      />
    );
  }

  return (
    <div className="px-6 py-6">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Places</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {places.length} place{places.length === 1 ? "" : "s"} ·{" "}
        {gpsCount > 0 && `${gpsCount} from GPS`}
        {gpsCount > 0 && sceneCount > 0 && " · "}
        {sceneCount > 0 && `${sceneCount} detected scenes`}
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {places.map((place) => (
          <button
            key={place.id}
            onClick={() => {
              setPlace(place.id);
              navigate("/photos");
            }}
            className="group overflow-hidden rounded-2xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
              {place.thumb ? (
                <img
                  src={place.thumb}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  {place.kind === "gps" ? (
                    <MapPin className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <Mountains className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
              )}
              <span
                className={cn(
                  "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  place.kind === "gps" ? "bg-foreground/80 text-background" : "bg-primary/90 text-primary-foreground",
                )}
              >
                {place.kind === "gps" ? "GPS" : "Scene"}
              </span>
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-semibold">{place.label}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                {place.kind === "gps" ? (
                  <>
                    <MapPin className="h-3 w-3" />
                    {place.lat != null && place.lng != null
                      ? `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`
                      : place.sub}
                  </>
                ) : (
                  <Mountains className="h-3 w-3" />
                )}
                {place.sub !== place.label && place.kind === "scene" ? place.sub : ""}
                <span className="ml-auto">
                  {place.count} photo{place.count === 1 ? "" : "s"}
                </span>
              </p>
            </div>
          </button>
        ))}
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Camera className="h-3.5 w-3.5" />
        GPS comes from photo EXIF and is read before re-encoding; scene labels are detected by an on-device classifier.
      </p>
    </div>
  );
}
