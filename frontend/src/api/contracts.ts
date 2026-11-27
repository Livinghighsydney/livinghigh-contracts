import type { Contract, ContractEvent } from "./types";
import { createCache } from "./store";
import { http } from "./http";

type ContractWithEvents = Contract & { events: ContractEvent[] };
// next_send_at comes back with the contract when it is queued (Documenso rate limit).
interface BackendContract
  extends Omit<Contract, "room_number" | "end_date" | "weekly_rent" | "bond_amount" | "start_date" | "property_address"> {
  room_number: string | null;
  end_date: string | null;
  weekly_rent: number | null;
  bond_amount: number | null;
  start_date: string | null;
  property_address: string | null;
  events: ContractEvent[];
}

function normalize(c: BackendContract): ContractWithEvents {
  const { room_number, end_date, ...rest } = c;
  return {
    ...rest,
    weekly_rent: Number(c.weekly_rent ?? 0),
    bond_amount: Number(c.bond_amount ?? 0),
    start_date: c.start_date ?? "",
    property_address: c.property_address ?? "",
    ...(room_number ? { room_number } : {}),
    ...(end_date ? { end_date } : {}),
  };
}

// Contracts change on their own (tenant opens/signs) — the live WebSocket triggers refreshes,
// so the cache never expires on a timer.
const cache = createCache<ContractWithEvents[]>(
  async () => (await http.get<BackendContract[]>("/api/contracts/overview")).map(normalize),
  [],
  Number.POSITIVE_INFINITY,
);

export interface EmailText {
  subject?: string;
  message?: string;
}

/** Error from sending when the contract itself was saved — the screen can open it. */
export class SendError extends Error {
  constructor(
    message: string,
    public contractId: string,
  ) {
    super(message);
  }
}

export const contractApi = {
  list: () => cache.read(),
  get: (key: string) => cache.read().find((c) => c.id === key),
  events: (key: string): ContractEvent[] => cache.read().find((c) => c.id === key)?.events ?? [],
  isLoaded: cache.isLoaded,
  reset: cache.reset,
  loadError: cache.error,
  refresh: cache.refresh,

  /** Save the contract; with status "sent" also send it — the backend emails the tenant from our domain. */
  async create(
    data: Omit<Contract, "id" | "created_by" | "created_at" | "updated_at">,
    email: EmailText = {},
  ): Promise<Contract> {
    const { status, ...details } = data;
    const created = await http.post<{ id: string }>("/api/contracts/", {
      template_key: details.template_key,
      tenant_name: details.tenant_name.trim(),
      tenant_email: details.tenant_email.trim(),
      property_address: details.property_address.trim(),
      room_number: details.room_number?.trim() || null,
      // Empty when the template doesn't print it.
      weekly_rent: details.weekly_rent || null,
      bond_amount: details.bond_amount || null,
      start_date: details.start_date || null,
      end_date: details.end_date || null,
      custom_values: details.custom_values ?? {},
    });
    if (status === "sent") {
      try {
        await http.post(`/api/contracts/${created.id}/send`, {
          email_subject: email.subject?.trim() || null,
          email_message: email.message?.trim() || null,
        });
      } catch (e) {
        await cache.refresh();
        throw new SendError(e instanceof Error ? e.message : "The contract couldn’t be sent.", created.id);
      }
    }
    await cache.refresh();
    const saved = contractApi.get(created.id);
    if (!saved) throw new Error("The contract was saved but couldn’t be loaded. Refresh the page.");
    return saved;
  },

  async action(key: string, action: "send" | "resend" | "cancel") {
    try {
      if (action === "send") await http.post(`/api/contracts/${key}/send`, {});
      else if (action === "resend") await http.post(`/api/contracts/${key}/resend-email`, {});
      else await http.post(`/api/contracts/${key}/cancel`, {});
    } finally {
      await cache.refresh();
    }
  },

  /** "Check status now": ask the backend to catch up with Documenso for this contract. */
  async sync(key: string) {
    const r = await http.post<{ status: string; changed: boolean }>(`/api/contracts/${key}/sync`);
    await cache.refresh();
    return r;
  },

  /** Download the signed agreement, certificate or audit log from our own storage. */
  async download(key: string, kind: "signed_pdf" | "certificate" | "audit_log") {
    const { url } = await http.get<{ url: string }>(`/api/contracts/${key}/files/${kind}`);
    const link = document.createElement("a");
    link.href = url;
    link.rel = "noopener";
    link.click();
  },
};
