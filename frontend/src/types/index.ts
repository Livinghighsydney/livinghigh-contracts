export type ContractStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "completed"
  | "rejected"
  | "cancelled"
  | "archived";

export interface ContractSummary {
  id: string;
  tenant_name: string;
  tenant_email: string;
  property_address: string;
  room_number: string | null;
  status: ContractStatus;
  created_at: string;
}

export interface ContractDetail extends ContractSummary {
  template_key: string;
  template_version: string;
  weekly_rent: string;
  bond_amount: string;
  start_date: string;
  end_date: string | null;
  documenso_envelope_id: string | null;
  created_by: string;
  updated_at: string;
}

export interface CreateContractPayload {
  template_key: string;
  tenant_name: string;
  tenant_email: string;
  property_address: string;
  room_number?: string;
  weekly_rent: number;
  bond_amount: number;
  start_date: string;
  end_date?: string;
  created_by: string;
}
