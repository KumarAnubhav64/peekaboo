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

export class ApiError extends Error {
  data: Record<string, unknown>;
  status: number;
  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.data = data;
    this.status = status;
  }
}

export async function postImage<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(url, { method: "POST", body: form });
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
  const res = await fetch(url);
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
