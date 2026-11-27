import { createCache } from "./store";
import { http } from "./http";
import { authApi } from "./auth";

interface BackendSettings {
  sender_name: string;
  sender_email: string;
  reply_to: string;
  email_configured: boolean;
}

const cache = createCache<BackendSettings>(
  () => http.get<BackendSettings>("/api/settings/"),
  { sender_name: "Living High", sender_email: "…", reply_to: "…", email_configured: true },
  300_000,
);

export const settingsApi = {
  get: () => ({
    ...cache.read(),
    staff_name: authApi.staffName(),
    staff_email: authApi.staffEmail(),
  }),
  isLoaded: cache.isLoaded,
};
