import { api } from "./client";
import type { ContractSummary, ContractDetail, CreateContractPayload } from "../types";

export const contractsApi = {
  list:   ()           => api.get<ContractSummary[]>("/api/contracts/"),
  get:    (id: string) => api.get<ContractDetail>(`/api/contracts/${id}`),
  create: (data: CreateContractPayload) =>
    api.post<{ id: string; status: string }>("/api/contracts/", data),
  send:   (id: string) =>
    api.post<{ id: string; status: string }>(`/api/contracts/${id}/send`, {}),
};
