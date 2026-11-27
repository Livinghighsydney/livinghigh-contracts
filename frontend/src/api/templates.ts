import type { DataKey, FieldType, Template, TemplateField } from "./types";
import { createCache } from "./store";
import { API_BASE, http } from "./http";

interface BackendField {
  id: string;
  type: FieldType;
  page: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  label?: string | null;
  dataKey?: DataKey | null;
  [extra: string]: unknown;
}

interface BackendTemplate {
  id: string;
  name: string;
  template_key: string;
  description: string;
  documenso_template_id: string | null;
  pdf_storage_key: string | null;
  fields_json: BackendField[];
  created_at: string;
}

// The editor shows data boxes with these icons; Documenso stores every data box as a TEXT field.
const DATA_TYPE: Record<DataKey, FieldType> = {
  tenant_name: "NAME",
  tenant_email: "EMAIL",
  property_address: "TEXT",
  room_number: "TEXT",
  weekly_rent: "TEXT",
  bond_amount: "TEXT",
  start_date: "DATE",
  end_date: "DATE",
};
const DEFAULT_LABEL: Record<string, string> = {
  SIGNATURE: "Signature", INITIALS: "Initials", DATE: "Date signed", NAME: "Full name",
  EMAIL: "Email", TEXT: "Text box", NUMBER: "Number", CHECKBOX: "Checkbox",
  RADIO: "Radio buttons", DROPDOWN: "Dropdown",
};
const DATA_LABEL: Record<DataKey, string> = {
  tenant_name: "Tenant name", tenant_email: "Tenant email", property_address: "Property address",
  room_number: "Room number", weekly_rent: "Weekly rent", bond_amount: "Bond amount",
  start_date: "Start date", end_date: "End date",
};

function fromBackend(f: BackendField): TemplateField {
  const { dataKey, label, ...rest } = f;
  if (dataKey) return { ...rest, type: DATA_TYPE[dataKey], dataKey, label: label || DATA_LABEL[dataKey] };
  return { ...rest, label: label || DEFAULT_LABEL[f.type] || f.type };
}

function toBackend(f: TemplateField) {
  return { ...f, type: f.dataKey ? "TEXT" : f.type, recipient: "tenant" };
}

function normalize(t: BackendTemplate): Template {
  const fields = (t.fields_json ?? []).map(fromBackend);
  return {
    id: t.id,
    name: t.name,
    template_key: t.template_key,
    description: t.description ?? "",
    field_count: fields.length,
    status: t.documenso_template_id && fields.length > 0 ? "ready" : "needs fields",
    created_at: t.created_at,
    ...(t.pdf_storage_key ? { pdfUrl: `${API_BASE}/api/templates/${t.id}/pdf` } : {}),
    fields,
  };
}

const cache = createCache<Template[]>(
  async () => (await http.get<BackendTemplate[]>("/api/templates/")).map(normalize),
  [],
  120_000,
);

export const templateApi = {
  list: () => cache.read(),
  get: (key: string) => cache.read().find((t) => t.id === key || t.template_key === key),
  isLoaded: cache.isLoaded,
  reset: cache.reset,
  loadError: cache.error,
  refresh: cache.refresh,

  async upload(
    data: Omit<Template, "id" | "created_at" | "fields" | "status" | "field_count" | "pdfUrl">,
    file: File,
  ) {
    if (cache.read().some((t) => t.template_key === data.template_key))
      throw new Error("That template key is already in use. Choose another.");
    const form = new FormData();
    form.append("name", data.name);
    form.append("template_key", data.template_key);
    form.append("description", data.description);
    form.append("file", file);
    const created = await http.postForm<BackendTemplate>("/api/templates/", form);
    await cache.refresh();
    return normalize(created);
  },

  async remove(key: string) {
    await http.delete(`/api/templates/${key}`);
    await cache.refresh();
  },

  async saveFields(key: string, fields: TemplateField[]) {
    if (!fields.some((f) => f.type === "SIGNATURE" && !f.dataKey))
      throw new Error("Add a tenant signature before saving.");
    await http.post(`/api/templates/${key}/fields`, { fields: fields.map(toBackend) });
    await cache.refresh();
  },
};
