import type { Contract, ContractEvent, ContractStatus, TemplateField } from "@/api/types";
export const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
export const date = (value: string) =>
  new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(new Date(value));
export const time = (value: string) =>
  new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Sydney",
  }).format(new Date(value));
export const isComplete = (status: ContractStatus) =>
  status === "completed" || status === "archived";
export const statusLabel = (status: ContractStatus) =>
  isComplete(status) ? "Completed" : status.charAt(0).toUpperCase() + status.slice(1);
/**
 * Checks the tenant details. With `used`, only the details the template prints are required.
 * `labels` = the template's own names for them (e.g. "Occupancy fee" for weekly_rent).
 */
export function validateDetails(
  c: Pick<
    Contract,
    | "tenant_name"
    | "tenant_email"
    | "property_address"
    | "weekly_rent"
    | "bond_amount"
    | "start_date"
    | "end_date"
  >,
  used?: Set<string>,
  labels: Partial<Record<string, string>> = {},
) {
  const need = (key: string) => !used || used.has(key);
  const name = (key: string, fallback: string) => `“${labels[key] || fallback}”`;
  const errors: Record<string, string> = {};
  if (!c.tenant_name.trim()) errors["tenant_name"] = "Enter the tenant’s full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.tenant_email))
    errors["tenant_email"] = "Enter a valid email address.";
  if (need("property_address") && !c.property_address.trim())
    errors["property_address"] = `Enter ${name("property_address", "Property address")}.`;
  if (need("weekly_rent") && !(c.weekly_rent > 0))
    errors["weekly_rent"] = `${name("weekly_rent", "Weekly rent")} must be above $0.`;
  if (need("bond_amount") && !(c.bond_amount > 0))
    errors["bond_amount"] = `${name("bond_amount", "Bond amount")} must be above $0.`;
  if (need("start_date") && !c.start_date) errors["start_date"] = `Choose ${name("start_date", "Start date")}.`;
  if (need("end_date") && c.end_date && c.start_date && c.end_date <= c.start_date)
    errors["end_date"] = `${name("end_date", "End date")} must be after ${name("start_date", "Start date")}.`;
  return errors;
}
export function fieldValue(field: TemplateField, c?: Partial<Contract>) {
  if (!field.dataKey) return field.label;
  const v = c?.[field.dataKey];
  if (v === undefined || v === "") return "";
  if (field.dataKey === "weekly_rent" || field.dataKey === "bond_amount") return money(Number(v));
  if (field.dataKey === "start_date" || field.dataKey === "end_date") return date(String(v));
  return String(v);
}
export function metrics(contracts: Contract[], events: (id: string) => ContractEvent[]) {
  const sent = contracts.filter((c) => events(c.id).some((e) => e.type === "sent")).length;
  const viewed = contracts.filter((c) => events(c.id).some((e) => e.type === "opened")).length;
  const completed = contracts.filter((c) => isComplete(c.status)).length;
  const durations = contracts
    .filter((c) => isComplete(c.status))
    .flatMap((c) => {
      const timeline = events(c.id);
      const s = timeline.find((e) => e.type === "sent");
      const end = timeline.find((e) => e.type === "signed");
      return s && end
        ? [(new Date(end.created_at).getTime() - new Date(s.created_at).getTime()) / 3600000]
        : [];
    });
  return {
    created: contracts.length,
    sent,
    viewed,
    completed,
    closeRate: sent ? Math.round((completed / sent) * 100) : 0,
    averageHours: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
  };
}
export const hasSignature = (fields: TemplateField[]) =>
  fields.some((f) => f.type === "SIGNATURE" && !f.dataKey);
export const templateKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
// A4 page in points (our templates are A4).
const PAGE_W_PT = 595;
const PAGE_H_PT = 842;

/**
 * Radio buttons / checkboxes: Documenso draws each circle or box as big as the font size, inside 8 pt
 * padding. With no size chosen, pick the biggest size that fits the field box — so dragging the box
 * bigger makes the buttons bigger. Keep in step with template_service.choice_font_size.
 */
export function choiceFontSize(f: TemplateField): number | null {
  if ((f.type !== "RADIO" && f.type !== "CHECKBOX") || f.tickOnly) return null;
  const s = f as TemplateField & { fontSize?: number | null; options?: string[] | null; direction?: string | null };
  if (s.fontSize) return s.fontSize;
  const options = (s.options ?? []).filter((o) => o.trim());
  const n = Math.max(1, options.length);
  const across = s.direction === "horizontal";
  const h = (f.height / 100) * PAGE_H_PT - 16;
  const w = (f.width / 100) * PAGE_W_PT - 8;
  const longest = Math.max(1, ...options.map((o) => o.length));
  const byHeight = (across ? h : h / n) * 0.8;
  // circle + gap + text (≈0.55 em per letter) must fit the width of one item
  const byWidth = ((across ? w / n : w) - 16) / (1 + 0.55 * longest);
  return Math.round(Math.min(96, Math.max(8, Math.min(byHeight, byWidth))));
}

/** CSS font size so the editor box looks like the PDF (the page element is a size container). */
export const ptToCss = (pt: number) => `${(pt / PAGE_W_PT) * 100}cqw`;

export function clampField(field: TemplateField): TemplateField {
  // Small minimum so a Tick box can sit exactly over a printed 4 mm box.
  const width = Math.min(100, Math.max(1, field.width));
  const height = Math.min(100, Math.max(0.8, field.height));
  return {
    ...field,
    width,
    height,
    positionX: Math.min(100 - width, Math.max(0, field.positionX)),
    positionY: Math.min(100 - height, Math.max(0, field.positionY)),
  };
}
