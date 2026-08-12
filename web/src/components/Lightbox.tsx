import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDots,
  Copy,
  DownloadSimple,
  LinkSimple,
  MapPin,
  Mountains,
  Shapes,
  Users,
} from "@phosphor-icons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { copyText, type LibraryPhoto, type PersonCluster } from "@/api";
import { formatDateLong } from "@/lib/filter";
import { useLibrary } from "@/lib/library-context";

interface Props {
  photo: LibraryPhoto | null;
  onClose: () => void;
  people: PersonCluster[]; // sorted, biggest first — index = label
  peopleByFace: Map<string, number>; // face id -> people index
  onCopy: (text: string, label: string) => void;
}

export function Lightbox({ photo, onClose, people, peopleByFace, onCopy }: Props) {
  const { setPerson } = useLibrary();
  const navigate = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);

  if (!photo) return null;

  const doCopy = async (text: string, label: string) => {
    await copyText(text);
    setCopied(label);
    onCopy(text, label);
    setTimeout(() => setCopied(null), 1500);
  };

  const filterByFace = (faceId: string) => {
    const pi = peopleByFace.get(faceId);
    if (pi === undefined) return;
    const person = people[pi];
    if (!person) return;
    setPerson(person.id);
    onClose();
    navigate("/photos");
  };

  return (
    <Dialog open={!!photo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(94vw,1200px)] gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Photo {photo.original_name}</DialogTitle>
        <DialogDescription className="sr-only">
          {formatDateLong(photo.uploaded_at || new Date().toISOString())}
        </DialogDescription>
        <div className="grid max-h-[86vh] md:grid-cols-[1fr_280px]">
          {/* Image area */}
          <div className="flex min-h-[50vh] items-center justify-center bg-black md:min-h-0">
            {photo.url && (
              <img
                src={photo.url}
                alt={photo.original_name}
                className="max-h-[86vh] w-full object-contain"
              />
            )}
          </div>

          {/* Metadata panel */}
          <div className="flex flex-col overflow-y-auto border-t p-5 md:border-l md:border-t-0">
            <p className="text-sm font-semibold leading-tight">{photo.original_name}</p>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDots className="h-3.5 w-3.5" />
              {formatDateLong(photo.uploaded_at || new Date().toISOString())}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {photo.width} × {photo.height}px · {photo.num_faces} face
              {photo.num_faces === 1 ? "" : "s"}
            </p>

            <Separator className="my-4" />

            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> People in this photo
            </p>
            {photo.faces.length === 0 ? (
              <p className="text-xs text-muted-foreground">No faces detected.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {photo.faces.map((f) => {
                  const pi = peopleByFace.get(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => filterByFace(f.id)}
                      className="group flex flex-col items-center gap-1 rounded-lg p-1.5 transition-colors hover:bg-accent"
                    >
                      <Avatar className="h-10 w-10 ring-1 ring-border">
                        <AvatarImage src={f.crop_url} alt="" />
                        <AvatarFallback>
                          <Users className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground">
                        {pi !== undefined ? `Person ${pi + 1}` : "New"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <Separator className="my-4" />

            {/* Enrichment: scene, objects, location */}
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Detected
            </p>
            <div className="flex flex-wrap gap-1.5">
              {photo.scene && (
                <Badge variant="secondary" className="gap-1">
                  <Mountains className="h-3 w-3" />
                  {photo.scene}
                </Badge>
              )}
              {photo.lat != null && photo.lng != null && (
                <Badge variant="secondary" className="gap-1">
                  <MapPin className="h-3 w-3" />
                  {photo.lat.toFixed(4)}, {photo.lng.toFixed(4)}
                </Badge>
              )}
            </div>
            {photo.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {photo.tags.map((t) => (
                  <Badge key={t} variant="outline" className="gap-1 text-[11px] capitalize">
                    <Shapes className="h-3 w-3" />
                    {t}
                  </Badge>
                ))}
              </div>
            )}
            {!photo.scene && photo.lat == null && photo.tags.length === 0 && (
              <p className="text-xs text-muted-foreground">
                This photo predates enrichment — upload it again to get scene, object and location data.
              </p>
            )}

            <Separator className="my-4" />

            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Share
            </p>
            {photo.share_url && (
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={() =>
                  doCopy(`${window.location.origin}${photo.share_url}`, "share")
                }
              >
                {copied === "share" ? <Copy className="text-emerald-600" /> : <LinkSimple />}
                {copied === "share" ? "Link copied!" : "Copy claim link"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-1.5 justify-start text-muted-foreground"
              asChild
            >
              <a href={photo.url || "#"} download={photo.original_name}>
                <DownloadSimple /> Download
              </a>
            </Button>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {photo.num_faces > 0 ? "Auto-detected" : "No faces"}
              </Badge>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
