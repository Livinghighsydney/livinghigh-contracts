import { changed } from "./store";
import { http, setUnauthorizedHandler } from "./http";
import { contractApi } from "./contracts";
import { templateApi } from "./templates";

export type Role = "admin" | "manager" | "member";
export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Manager", member: "Member" };

export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  is_owner: boolean;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

type Status = "unknown" | "signed-in" | "signed-out" | "error";
let status: Status = "unknown";
let user: StaffUser | null = null;
let loadError = "";
let inflight: Promise<void> | null = null;

function setSignedOut() {
  user = null;
  status = "signed-out";
  contractApi.reset();
  templateApi.reset();
  changed();
}

// Session expired or account deactivated while using the app → back to sign-in.
setUnauthorizedHandler(() => {
  if (status === "signed-in") setSignedOut();
});

function load(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (inflight) return inflight;
  inflight = http
    .get<StaffUser>("/api/auth/me")
    .then((u) => {
      user = u;
      status = "signed-in";
    })
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : "";
      if (/sign in/i.test(msg)) {
        user = null;
        status = "signed-out";
      } else {
        status = "error";
        loadError = msg || "Could not reach the server.";
      }
    })
    .finally(() => {
      inflight = null;
      changed();
    });
  return inflight;
}

export const authApi = {
  /** "unknown" until the first check finishes (starts it automatically). */
  status(): Status {
    if (status === "unknown" && !inflight && typeof window !== "undefined") queueMicrotask(() => void load());
    return status;
  },
  error: () => loadError,
  retry: () => {
    status = "unknown";
    changed();
    return load();
  },
  user: () => user,
  isSignedIn: () => status === "signed-in",
  staffName: () => user?.name ?? "Living High staff",
  staffEmail: () => user?.email ?? "",
  role: (): Role | null => user?.role ?? null,
  /** Admins and Managers: team page, templates, all contracts. */
  canManageTeam: () => user?.role === "admin" || user?.role === "manager",
  canManageTemplates: () => user?.role === "admin" || user?.role === "manager",
  isAdmin: () => user?.role === "admin",

  async signIn(email: string, password: string) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
    if (!password) throw new Error("Enter your password.");
    user = await http.post<StaffUser>("/api/auth/login", { email: email.trim(), password });
    status = "signed-in";
    contractApi.reset();
    templateApi.reset();
    changed();
  },
  async signOut() {
    try {
      await http.post("/api/auth/logout");
    } finally {
      setSignedOut();
    }
  },
  async changePassword(current_password: string, new_password: string) {
    await http.post("/api/auth/change-password", { current_password, new_password });
    if (user) user = { ...user, must_change_password: false };
    changed();
  },

  // ---- Invites (public: before the person has an account) ----
  getInvite: (token: string) =>
    http.get<{ email: string; role: Role; role_label: string; invited_by: string; expires_at: string }>(
      `/api/auth/invite/${encodeURIComponent(token)}`,
    ),
  async acceptInvite(token: string, name: string, password: string) {
    user = await http.post<StaffUser>(`/api/auth/invite/${encodeURIComponent(token)}/accept`, { name, password });
    status = "signed-in";
    contractApi.reset();
    templateApi.reset();
    changed();
  },
};
