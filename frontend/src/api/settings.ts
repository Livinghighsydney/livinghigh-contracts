import { createCache } from "./store";
import { http } from "./http";
import { authApi } from "./auth";

interface BackendSettings {
  sender_name: string;
  sender_email: string;
  reply_to: string;
  email_configured: boolean;
  /** Only Admins can change the sender name / reply-to. */
  can_edit: boolean;
}

const cache = createCache<BackendSettings>(
  () => http.get<BackendSettings>("/api/settings/"),
  { sender_name: "Living High", sender_email: "…", reply_to: "…", email_configured: true, can_edit: false },
  300_000,
);

export const settingsApi = {
  get: () => ({
    ...cache.read(),
    staff_name: authApi.staffName(),
    staff_email: authApi.staffEmail(),
  }),
  isLoaded: cache.isLoaded,
  /** Save one sender setting (Admins only). The reply has the saved settings — no extra reload. */
  async updateEmail(change: { sender_name: string } | { reply_to: string }) {
    cache.set(await http.patch<BackendSettings>("/api/settings/email", change));
  },
};
