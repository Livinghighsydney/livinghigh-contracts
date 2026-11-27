export type ContractStatus =
  "draft" | "queued" | "sent" | "viewed" | "completed" | "archived" | "rejected" | "cancelled";
export interface Contract {
  id: string;
  template_key: string;
  status: ContractStatus;
  tenant_name: string;
  tenant_email: string;
  property_address: string;
  room_number?: string;
  weekly_rent: number;
  bond_amount: number;
  start_date: string;
  end_date?: string;
  /** Staff answers to the template's staff fields: {field id: text | ["checked", ...]} */
  custom_values?: Record<string, string | string[]>;
  /** Queued (Documenso rate limit): when the app will try to send it. */
  next_send_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface ContractEvent {
  type:
    | "created"
    | "sent"
    | "email sent"
    | "opened"
    | "signed"
    | "completed"
    | "signed copy emailed"
    | "email failed"
    | "cancelled"
    | "queued"
    | "send failed";
  created_at: string;
}
// The backend also supports NUMBER / CHECKBOX / RADIO / DROPDOWN (set up with the earlier editor).
export type FieldType =
  | "SIGNATURE" | "INITIALS" | "DATE" | "NAME" | "EMAIL" | "TEXT"
  | "NUMBER" | "CHECKBOX" | "RADIO" | "DROPDOWN";
export type DataKey =
  | "tenant_name"
  | "tenant_email"
  | "property_address"
  | "room_number"
  | "weekly_rent"
  | "bond_amount"
  | "start_date"
  | "end_date";
export interface TemplateField {
  id: string;
  type: FieldType;
  page: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  dataKey?: DataKey;
  /** Staff answer it on the New Contract form; the tenant sees it read-only. */
  staffFill?: boolean;
  /** Tick box: box only, placed exactly over a box printed on the PDF. */
  tickOnly?: boolean;
  /** Staff tick box: the question (boxes with the same question are answered together) … */
  group?: string;
  /** … and what this box means, e.g. "Yes". */
  optionLabel?: string;
  /** Staff pick one box (radio) or any boxes (checkboxes) for this question. */
  groupMode?: "one" | "any";
  /** Tick box: also print its text (label, or "This box means" for staff boxes) next to the box. */
  showText?: boolean;
  /** Staff Text field answered with a date picker on New Contract; printed as dd/mm/yyyy. */
  dateInput?: boolean;
  /** Staff field: show the same answer as another staff field (like PandaDoc "Copy and link"). */
  linkTo?: string | null;
  /** Staff field: prefilled, but the tenant may change it when signing. */
  tenantEditable?: boolean;
  label: string;
  // Extra settings kept from the backend (required, options, fontSize…) pass through untouched.
  [extra: string]: unknown;
}
export interface Template {
  id: string;
  name: string;
  template_key: string;
  description: string;
  field_count: number;
  status: "needs fields" | "ready";
  created_at: string;
  pdfUrl?: string;
  fields: TemplateField[];
}
