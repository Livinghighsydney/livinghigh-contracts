/** Talks to the Living High FastAPI backend. All resource modules go through here. */
// Production: same origin — /api is forwarded to the backend (see vite.config.ts). Dev: local backend.
export const API_BASE: string =
  (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/$/, "") ??
  (import.meta.env.PROD ? "" : "http://localhost:8000");

/** Turn a FastAPI error body into one plain-English sentence. */
function errorMessage(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => {
        const msg = (d.msg ?? "").replace(/^Value error, /, "");
        const last = d.loc?.[d.loc.length - 1];
        const field =
          typeof last === "string" && last !== "body" && !/^\d+$/.test(last) ? last.replace(/_/g, " ") : "";
        return field ? `${field}: ${msg}` : msg;
      })
      .join(" ");
  }
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return `Request failed (HTTP ${status}).`;
}

// Called when the backend says "please sign in" (expired session, deactivated account).
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    // Sends the HttpOnly session cookie to the API.
    res = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include" });
  } catch {
    throw new Error("Can’t reach the server. Check your connection and try again.");
  }
  if (res.status === 401 && !path.startsWith("/api/auth/")) onUnauthorized();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(errorMessage(body, res.status));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export const isBrowser = () => typeof window !== "undefined";
