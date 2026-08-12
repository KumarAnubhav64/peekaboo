// Typed API client for the Peekaboo backend.

export interface FaceResult {
  id: string;
  bbox: number[];
  crop_url: string;
  share_url: string;
  token: string;
}

export interface UploadResponse {
  photo: { id: string; width: number; height: number; url: string };
  faces: FaceResult[];
}

export interface ClaimInfo {
  token: string;
  face_id: string;
  crop_url: string;
}

export interface ClaimPhoto {
  photo_id: string;
  url: string;
  thumb: string;
}

export interface ClaimResponse {
  status: "verified";
  similarity: number;
  threshold: number;
  photos: ClaimPhoto[];
}

export interface LibraryFace {
  id: string;
  crop_url: string;
  share_url: string;
}

export interface LibraryPhoto {
  id: string;
  url: string | null;
  thumb: string | null;
  width: number;
  height: number;
  num_faces: number;
  uploaded_at: string | null;
  original_name: string;
  share_url: string | null;
  faces: LibraryFace[];
  // Enrichment (vision + EXIF): may be empty/null on older uploads.
  lat: number | null;
  lng: number | null;
  tags: string[];
  scene: string | null;
}

export interface PersonCluster {
  id: string;
  avatar: string | null;
  count: number;
  face_ids: string[];
  photo_ids: string[];
}

export interface Place {
  id: string;
  kind: "gps" | "scene";
  label: string;
  sub: string;
  lat: number | null;
  lng: number | null;
  count: number;
  photo_ids: string[];
  thumb: string | null;
}

export interface Thing {
  label: string;
  count: number;
  photo_ids: string[];
}

export interface LibraryData {
  photos: LibraryPhoto[];
  people: PersonCluster[];
  places: Place[];
  things: Thing[];
}

export class ApiError extends Error {
  data: Record<string, unknown>;
  status: number;
  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.data = data;
    this.status = status;
  }
}

// httpOnly session cookie is sent automatically on same-origin requests;
// credentials is explicit for safety.
const FETCH: RequestInit = { credentials: "include" };

export async function postImage<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(url, { ...FETCH, method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (data.detail as string) || `Request failed (${res.status})`,
      res.status,
      data as Record<string, unknown>,
    );
  }
  return data as T;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    ...FETCH,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (data.detail as string) || `Request failed (${res.status})`,
      res.status,
      data as Record<string, unknown>,
    );
  }
  return data as T;
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, FETCH);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (data.detail as string) || `Request failed (${res.status})`,
      res.status,
      data as Record<string, unknown>,
    );
  }
  return data as T;
}

export async function deleteJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    ...FETCH,
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (data.detail as string) || `Request failed (${res.status})`,
      res.status,
      data as Record<string, unknown>,
    );
  }
  return data as T;
}

export async function getLibrary(): Promise<LibraryData> {
  return getJson<LibraryData>("/api/library");
}

/** Permanently delete photos. Returns the number deleted. */
export async function deletePhotos(ids: string[]): Promise<number> {
  const r = await deleteJson<{ deleted: number }>("/api/photos", { ids });
  return r.deleted;
}

/**
 * Upload one image with real byte-progress (XHR), resolving with the same
 * shape as `postImage`. `onProgress` is 0-100 while bytes transfer; the
 * server-side face analysis happens after 100% and this promise resolves
 * when it finishes.
 */
export function uploadImageWithProgress(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.open("POST", "/api/upload");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        /* non-JSON error body */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as unknown as UploadResponse);
      } else {
        reject(
          new ApiError(
            (data.detail as string) || `Upload failed (${xhr.status})`,
            xhr.status,
            data,
          ),
        );
      }
    };
    xhr.onerror = () => reject(new ApiError("Network error during upload.", 0, {}));
    xhr.send(form);
  });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
