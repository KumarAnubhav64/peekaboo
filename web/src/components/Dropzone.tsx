import { useRef, useState, type ReactNode } from "react";

interface Props {
  onFile: (file: File) => void;
  title: ReactNode;
  subtitle: string;
  icon?: string;
  label?: string;
}

export default function Dropzone({ onFile, title, subtitle, icon = "📷", label = "Upload a file" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (file) onFile(file);
  };

  return (
    <div
      className={`dropzone${dragging ? " dragover" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="dz-icon">{icon}</div>
      <p className="dz-title">{title}</p>
      <p className="dz-sub">{subtitle}</p>
    </div>
  );
}
