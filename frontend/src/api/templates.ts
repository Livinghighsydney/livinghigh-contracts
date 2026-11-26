const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Contract details a data box can show. Filled in automatically when a contract is sent. */
export type DataKey =
  | "tenant_name" | "tenant_email" | "property_address" | "room_number"
  | "weekly_rent" | "bond_amount" | "start_date" | "end_date";

export interface TemplateField {
  id: string;
  type: "SIGNATURE" | "INITIALS" | "DATE" | "NAME" | "EMAIL" | "TEXT";
  page: number;
  positionX: number; // all four are 0–100, percent of the page
  positionY: number;
  width: number;
  height: number;
  recipient: "tenant";
  dataKey?: DataKey | null; // set → read-only data box, pre-filled from the contract
  label?: string | null;
  documensoFieldId?: number | null; // set by the backend on save
}

export interface Template {
  id: string;
  name: string;
  template_key: string;
  description: string;
  documenso_template_id: string | null;
  pdf_storage_key: string | null;
  fields_json: TemplateField[];
  recipient_map: Record<string, number>;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const templatesApi = {
  list: () =>
    fetch(`${BASE}/api/templates/`).then((r) => handle<Template[]>(r)),

  upload: (formData: FormData) =>
    fetch(`${BASE}/api/templates/`, { method: "POST", body: formData }).then((r) =>
      handle<Template>(r)
    ),

  getPdfUrl: (id: string) =>
    fetch(`${BASE}/api/templates/${id}/pdf-url`).then((r) => handle<{ url: string }>(r)),

  saveFields: (id: string, fields: TemplateField[]) =>
    fetch(`${BASE}/api/templates/${id}/fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    }).then((r) => handle<Template>(r)),

  deactivate: (id: string) =>
    fetch(`${BASE}/api/templates/${id}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }),
};
