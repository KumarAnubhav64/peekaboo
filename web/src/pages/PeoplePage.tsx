import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "@phosphor-icons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useLibrary } from "@/lib/library-context";
import { personLabel, sortedPeople } from "@/lib/filter";
import { UploadDialog } from "@/components/UploadDialog";

export default function PeoplePage() {
  const { data, loading, upload, setPerson } = useLibrary();
  const navigate = useNavigate();
  const people = useMemo(() => sortedPeople(data), [data]);

  if (loading) {
    return (
      <div className="px-6 py-6">
        <Skeleton className="mb-5 h-6 w-40" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
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
            icon={Users}
            title="No people yet"
            description="Upload photos and Peekaboo will cluster every face into a person. Then you can filter your library by who's in it."
            actionLabel="Upload photos"
          />
        </div>
      </UploadDialog>
    );
  }

  if (people.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No faces detected"
        description="Your photos are here, but no faces were found in them yet. Try uploading photos with people in them."
        actionLabel="Back to photos"
        onAction={() => navigate("/photos")}
      />
    );
  }

  return (
    <div className="px-6 py-6">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">People</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {people.length} person{people.length === 1 ? "" : "s"} detected in your library
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {people.map((p, i) => (
          <button
            key={p.id}
            onClick={() => {
              setPerson(p.id);
              navigate("/photos");
            }}
            className="group flex flex-col items-center gap-3 rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <Avatar className="h-20 w-20 transition-shadow group-hover:ring-2 group-hover:ring-ring">
              {p.avatar ? <AvatarImage src={p.avatar} alt="" /> : null}
              <AvatarFallback className="bg-primary/10 text-primary">
                <Users className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <p className="text-sm font-semibold">{personLabel(i)}</p>
              <p className="text-xs text-muted-foreground">
                {p.count} face{p.count === 1 ? "" : "s"} · {p.photo_ids.length} photo
                {p.photo_ids.length === 1 ? "" : "s"}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
