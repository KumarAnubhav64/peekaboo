import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getLibrary, uploadImageWithProgress, type LibraryData } from "@/api";

export type DateFilter = "any" | "7d" | "30d" | "this-year";

export interface Filters {
  personId: string | null;
  date: DateFilter;
  q: string;
}

export interface UploadItem {
  name: string;
  status: "uploading" | "analyzing" | "done" | "error";
  progress: number; // 0-100 (bytes); 100 = uploaded, analyzing
  error?: string;
}

interface LibraryContextValue {
  data: LibraryData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  // upload queue
  queue: UploadItem[];
  analyzing: boolean; // at least one upload past the byte phase, awaiting results
  upload: (files: File[]) => void;
  // filters
  filters: Filters;
  setPerson: (id: string | null) => void;
  setDate: (d: DateFilter) => void;
  setQuery: (q: string) => void;
  clearFilters: () => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [filters, setFilters] = useState<Filters>({ personId: null, date: "any", q: "" });
  const busy = useRef(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const lib = await getLibrary();
      setData(lib);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your library.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the library once when the shell mounts.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const upload = useCallback(
    (files: File[]) => {
      if (files.length === 0 || busy.current) return;
      busy.current = true;
      const items: UploadItem[] = files.map((f) => ({
        name: f.name,
        status: "uploading",
        progress: 0,
      }));
      setQueue(items);
      setError(null);

      if (clearTimer.current) clearTimeout(clearTimer.current);
      (async () => {
        for (let i = 0; i < files.length; i++) {
          const idx = i;
          try {
            await uploadImageWithProgress(files[i], (pct) => {
              // uploading (0-99) -> analyzing (100, response pending: the
              // endpoint runs face detection after the last byte)
              setQueue((q) =>
                q.map((it, j) =>
                  j === idx
                    ? { ...it, progress: pct, status: pct >= 100 ? "analyzing" : "uploading" }
                    : it,
                ),
              );
            });
            setQueue((q) => q.map((it, j) => (j === idx ? { ...it, status: "done" } : it)));
          } catch (e) {
            setQueue((q) =>
              q.map((it, j) =>
                j === idx
                  ? { ...it, status: "error", error: e instanceof Error ? e.message : "Upload failed" }
                  : it,
              ),
            );
          }
        }
        busy.current = false;
        await refresh();
        // clear the queue shortly after completion so the UI settles
        clearTimer.current = setTimeout(() => setQueue([]), 4000);
      })();
    },
    [refresh],
  );

  const analyzing = queue.some((i) => i.status === "analyzing");

  const value: LibraryContextValue = {
    data,
    loading,
    error,
    refresh,
    queue,
    analyzing,
    upload,
    filters,
    setPerson: (personId) => setFilters((f) => ({ ...f, personId })),
    setDate: (date) => setFilters((f) => ({ ...f, date })),
    setQuery: (q) => setFilters((f) => ({ ...f, q })),
    clearFilters: () => setFilters({ personId: null, date: "any", q: "" }),
  };

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used inside <LibraryProvider>");
  return ctx;
}
