import { useRef, useState, type ReactNode } from "react";
import { Camera, CheckCircle, CircleNotch, CloudArrowUp, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useLibrary } from "@/lib/library-context";
import { cn } from "@/lib/utils";

export function UploadDialog({ children, onFiles }: { children: ReactNode; onFiles: (f: File[]) => void }) {
  const { queue, analyzing } = useLibrary();
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    onFiles(imgs);
    // keep the dialog open so per-batch progress stays visible
  };

  const finished = queue.length > 0 && queue.every((i) => i.status === "done" || i.status === "error");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload photos</DialogTitle>
          <DialogDescription>
            Every face gets a private claim link. Faces are detected and grouped automatically.
          </DialogDescription>
        </DialogHeader>

        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pick(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60",
          )}
        >
          <Camera className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Drag & drop photos here</p>
          <p className="text-xs text-muted-foreground">or click to browse · JPG / PNG</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => pick(e.target.files)}
          />
        </div>

        {/* Live batch progress */}
        {queue.length > 0 && (
          <div className="space-y-2.5">
            {queue.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                {item.status === "done" ? (
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : item.status === "error" ? (
                  <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                ) : item.status === "analyzing" ? (
                  <CircleNotch className="h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <span className="h-4 w-4 shrink-0 text-[10px] font-semibold text-muted-foreground">
                    {item.progress}%
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{item.name}</p>
                  {item.error && <p className="truncate text-[11px] text-destructive">{item.error}</p>}
                </div>
                <div className="w-20">
                  {item.status === "analyzing" ? (
                    <p className="text-right text-[11px] text-muted-foreground">Analyzing faces…</p>
                  ) : item.status === "done" ? (
                    <p className="text-right text-[11px] text-emerald-600">Done</p>
                  ) : item.status === "error" ? (
                    <p className="text-right text-[11px] text-destructive">Failed</p>
                  ) : (
                    <Progress value={item.progress} className="h-1.5" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {(finished || analyzing) && (
          <Button
            variant="outline"
            className="w-full"
            disabled={analyzing}
            onClick={() => setOpen(false)}
          >
            <CloudArrowUp className="h-4 w-4" />
            {analyzing ? "Uploading & analyzing…" : "Done"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
