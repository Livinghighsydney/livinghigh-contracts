import { createCache } from "./store";
import { http } from "./http";
import type { Role, StaffUser } from "./auth";

export interface TeamMember extends StaffUser {
  contract_count: number;
}
export interface TeamInvite {
  id: string;
  email: string;
  role: Role;
  status: "pending" | "expired" | "accepted" | "revoked";
  invited_by: string | null;
  expires_at: string;
  created_at: string;
}
interface TeamData {
  members: TeamMember[];
  invites: TeamInvite[];
}

const cache = createCache<TeamData>(() => http.get<TeamData>("/api/team/"), { members: [], invites: [] }, 60_000);

export const teamApi = {
  data: () => cache.read(),
  isLoaded: cache.isLoaded,
  loadError: cache.error,
  refresh: cache.refresh,
  reset: cache.reset,

  async invite(email: string, role: Role) {
    await http.post("/api/team/invites", { email: email.trim(), role });
    await cache.refresh();
  },
  async resendInvite(id: string) {
    await http.post(`/api/team/invites/${id}/resend`);
    await cache.refresh();
  },
  async cancelInvite(id: string) {
    await http.delete(`/api/team/invites/${id}`);
    await cache.refresh();
  },
  async setRole(userId: string, role: Role) {
    await http.patch(`/api/team/members/${userId}`, { role });
    await cache.refresh();
  },
  async setActive(userId: string, is_active: boolean) {
    await http.patch(`/api/team/members/${userId}`, { is_active });
    await cache.refresh();
  },
  async transferContracts(fromId: string, toId: string) {
    const r = await http.post<{ moved: number }>(`/api/team/members/${fromId}/transfer`, { to_user_id: toId });
    await cache.refresh();
    return r.moved;
  },
};
