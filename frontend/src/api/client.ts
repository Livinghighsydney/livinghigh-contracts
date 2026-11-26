const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Turn a FastAPI error body into one readable sentence. */
export function errorMessage(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // Validation errors: [{loc: ["body", "tenant_email"], msg: "..."}]
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => {
        const field = String(d.loc?.[d.loc.length - 1] ?? "").replace(/_/g, " ");
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .join("; ");
  }
  return `Request failed (HTTP ${status})`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(errorMessage(body, res.status));
  }
  return res.json() as Promise<T>;
}

export const api = {
  get:  <T>(path: string)                  => request<T>(path),
  post: <T>(path: string, body: unknown)   => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
};
