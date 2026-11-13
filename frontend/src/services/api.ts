import type { ApiEnvelope } from "../types/api";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ApiError"; }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError("Cannot reach API Lens. Check that the backend is running.", 0);
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null) as (ApiEnvelope<T> & { error?: { message?: string } }) | null;
  if (!response.ok || !payload?.success) {
    throw new ApiError(payload?.error?.message ?? `Request failed (${response.status})`, response.status);
  }
  return payload.data;
}

export function rangeQuery(range: string): string { return `?range=${encodeURIComponent(range)}`; }
