import { api } from "./client";
import type { ContractSummary, ContractDetail, CreateContractPayload } from "../types";

export const contractsApi = {
  list:   ()           => api.get<ContractSummary[]>("/api/contracts/"),
  get:    (id: string) => api.get<ContractDetail>(`/api/contracts/${id}`),
  create: (data: CreateContractPayload) =>
    api.post<{ id: string; status: string }>("/api/contracts/", data),
  send:   (id: string, email?: { email_subject?: string; email_message?: string }) =>
    api.post<{ id: string; status: string }>(`/api/contracts/${id}/send`, email ?? {}),
  resendEmail: (id: string) =>
    api.post<{ sent: "signing_request" | "completed_copy" }>(`/api/contracts/${id}/resend-email`, {}),
};
