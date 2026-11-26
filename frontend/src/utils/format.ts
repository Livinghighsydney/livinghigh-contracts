import type { DataKey } from "../api/templates";

/** Contract details as typed in the form (all strings). */
export interface ContractDetailsForm {
  tenant_name: string;
  tenant_email: string;
  property_address: string;
  room_number: string;
  weekly_rent: string;
  bond_amount: string;
  start_date: string; // yyyy-mm-dd from <input type="date">
  end_date: string;
}

export const emptyDetails: ContractDetailsForm = {
  tenant_name: "", tenant_email: "", property_address: "", room_number: "",
  weekly_rent: "", bond_amount: "", start_date: "", end_date: "",
};

/** $1,350.50 — must match backend contract_service._data_values. */
export function formatMoney(v: string): string {
  const n = Number(v);
  if (v === "" || Number.isNaN(n)) return "";
  return "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 01/12/2026 — must match backend contract_service._data_values. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** The exact text a data box will show on the agreement. */
export function dataValue(key: DataKey, d: ContractDetailsForm): string {
  switch (key) {
    case "weekly_rent": return formatMoney(d.weekly_rent);
    case "bond_amount": return formatMoney(d.bond_amount);
    case "start_date":  return formatDate(d.start_date);
    case "end_date":    return formatDate(d.end_date);
    default:            return d[key].trim();
  }
}

export const DATA_LABELS: Record<DataKey, string> = {
  tenant_name: "Tenant name",
  tenant_email: "Tenant email",
  property_address: "Property address",
  room_number: "Room number",
  weekly_rent: "Weekly rent",
  bond_amount: "Bond amount",
  start_date: "Start date",
  end_date: "End date",
};
