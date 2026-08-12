import type { Filters } from "./library-context";
import type { LibraryData, LibraryPhoto } from "@/api";

/** Human label for a person cluster ("Person 1", "Person 2", … ordered by size). */
export function personLabel(index: number): string {
  return `Person ${index + 1}`;
}

/** COCO animal tags — drives the "Animals" section of the Things view.
 *  MUST mirror app/vision.py's ANIMAL_LABELS (keep both in sync). */
export const ANIMAL_LABELS = new Set([
  "bird",
  "cat",
  "dog",
  "horse",
  "sheep",
  "cow",
  "elephant",
  "bear",
  "zebra",
  "giraffe",
]);

/** Sorted people: biggest clusters first (stable). */
export function sortedPeople(data: LibraryData | null) {
  if (!data) return [];
  return [...data.people].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export function photoInPerson(photo: LibraryPhoto, personId: string, data: LibraryData): boolean {
  const cluster = data.people.find((p) => p.id === personId);
  return cluster ? cluster.photo_ids.includes(photo.id) : false;
}

export function photoInPlace(photo: LibraryPhoto, placeId: string, data: LibraryData): boolean {
  const place = data.places.find((p) => p.id === placeId);
  return place ? place.photo_ids.includes(photo.id) : false;
}

/** Searchable text for a photo: name, dates, detected tags, scene, places. */
export function photoSearchText(photo: LibraryPhoto, data: LibraryData): string {
  const placeLabels = data.places
    .filter((pl) => pl.photo_ids.includes(photo.id))
    .map((pl) => pl.label);
  return [
    photo.original_name,
    photo.uploaded_at ? formatDay(photo.uploaded_at) : "",
    photo.uploaded_at ? formatMonth(photo.uploaded_at) : "",
    ...(photo.tags ?? []),
    photo.scene ?? "",
    ...placeLabels,
  ]
    .join(" ")
    .toLowerCase();
}

export function matchesFilters(photo: LibraryPhoto, data: LibraryData, f: Filters): boolean {
  if (f.personId && !photoInPerson(photo, f.personId, data)) return false;
  if (f.placeId && !photoInPlace(photo, f.placeId, data)) return false;
  if (f.thing && !(photo.tags ?? []).includes(f.thing)) return false;

  if (f.date !== "any") {
    const t = photo.uploaded_at ? new Date(photo.uploaded_at).getTime() : Date.now();
    const now = Date.now();
    const DAY = 86400000;
    if (f.date === "7d" && now - t > 7 * DAY) return false;
    if (f.date === "30d" && now - t > 30 * DAY) return false;
    if (f.date === "this-year" && new Date(t).getFullYear() !== new Date(now).getFullYear())
      return false;
  }

  if (f.q.trim()) {
    const q = f.q.trim().toLowerCase();
    if (!photoSearchText(photo, data).includes(q)) return false;
  }
  return true;
}

export function filterPhotos(data: LibraryData, f: Filters): LibraryPhoto[] {
  return data.photos.filter((p) => matchesFilters(p, data, f));
}

/* ------------------------------- grouping ------------------------------ */

export function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatMonth(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}

export function formatDateLong(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

/** Group photos by day, preserving photo order, returns [label, photos][]. */
export function groupByDay(photos: LibraryPhoto[]): [string, LibraryPhoto[]][] {
  const groups = new Map<string, LibraryPhoto[]>();
  for (const p of photos) {
    const label = p.uploaded_at ? formatDay(p.uploaded_at) : "Unknown date";
    const arr = groups.get(label);
    if (arr) arr.push(p);
    else groups.set(label, [p]);
  }
  return [...groups.entries()];
}
