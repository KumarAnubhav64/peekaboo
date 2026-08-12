import { useRef, useState, type ReactNode } from "react";
import { Camera } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface Props {
  onFile: (file: File) => void;
  title: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
}

export default function Dropzone({ onFile, title, subtitle, icon }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  return (
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
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60",
      )}
    >
      <span className="text-2xl">{icon ?? <Camera className="h-6 w-6 text-muted-foreground" />}</span>
      <p className="text-sm font-medium">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
    </div>
  );
}
