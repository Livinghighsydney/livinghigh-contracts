import type { ReactNode } from "react";
import { useState } from "react";
import { Plus, X, ChevronUp, ChevronDown, ClipboardList, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Contract, DataKey, TemplateField } from "@/api/types";
import { choiceFontSize, date, money } from "@/lib/contracts";

/** Field types where the tenant picks from a list. */
export const CHOICE_TYPES = ["CHECKBOX", "RADIO", "DROPDOWN"] as const;
export const isChoice = (f: TemplateField) => (CHOICE_TYPES as readonly string[]).includes(f.type);

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24];

// Settings live on the field object (the backend maps them to Documenso fieldMeta).
type Settings = {
  linkTo?: string | null;
  tenantEditable?: boolean;
  required?: boolean;
  placeholder?: string | null;
  fontSize?: number | null;
  textAlign?: "left" | "center" | "right" | null;
  characterLimit?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  options?: string[] | null;
  defaultOption?: string | null;
  direction?: "vertical" | "horizontal" | null;
};
export const settingsOf = (f: TemplateField) => f as TemplateField & Settings;

/** What each field type supports. */
function supports(f: TemplateField) {
  const data = Boolean(f.dataKey);
  const t = f.type;
  if (f.tickOnly)
    return {
      placeholder: false, required: !f.staffFill, fontSize: false, textAlign: false, characterLimit: false,
      minMax: false, options: false, defaultOption: false, direction: false,
    };
  return {
    placeholder: !data && !f.staffFill && ["TEXT", "NUMBER", "NAME", "EMAIL", "DROPDOWN"].includes(t),
    required: !data && t !== "SIGNATURE" && !(f.staffFill && t === "CHECKBOX") && !f.linkTo, // staff may tick none
    fontSize: t !== "SIGNATURE",
    textAlign: data || ["TEXT", "NUMBER", "NAME", "EMAIL", "DATE", "INITIALS"].includes(t),
    characterLimit: !data && t === "TEXT",
    minMax: t === "NUMBER",
    options: isChoice(f) && !f.linkTo,
    defaultOption: (t === "RADIO" || t === "DROPDOWN") && !f.linkTo,
    direction: t === "CHECKBOX" || t === "RADIO",
  };
}

/** Problem with a field's options that blocks saving, or "". */
export function optionProblem(f: TemplateField): string {
  if (f.tickOnly) {
    if (f.staffFill && (!f.group?.trim() || !f.optionLabel?.trim()))
      return "Each staff tick box needs a question and what the box means (e.g. Furnished → Yes).";
    return "";
  }
  if (!isChoice(f) || f.linkTo) return "";
  const opts = (settingsOf(f).options ?? []).map((o) => o.trim());
  if (!opts.some(Boolean)) return `“${f.label}” needs at least one option.`;
  if (opts.some((o) => !o)) return `“${f.label}” has an empty option.`;
  if (new Set(opts).size !== opts.length) return `“${f.label}” has the same option twice.`;
  return "";
}

export type Answers = Record<string, string | string[]>;

export interface TickGroup {
  key: string; // "group:<question>" — the key used in contract.custom_values
  question: string;
  mode: "one" | "any";
  options: string[];
  required: boolean;
}

/** Staff tick boxes grouped by question (same rules as the backend). */
export function tickGroups(fields: TemplateField[]): TickGroup[] {
  const map = new Map<string, TickGroup>();
  for (const f of fields) {
    if (!f.tickOnly || !f.staffFill || !f.group) continue;
    let g = map.get(f.group);
    if (!g) {
      g = { key: `group:${f.group}`, question: f.group, mode: f.groupMode ?? "one", options: [], required: settingsOf(f).required !== false };
      map.set(f.group, g);
    }
    if (f.optionLabel && !g.options.includes(f.optionLabel)) g.options.push(f.optionLabel);
  }
  return [...map.values()];
}

/** Short preview of a field on the PDF (e.g. "☐ Yes  ☐ No"); with staff answers, shows them ticked. */
export function boxText(f: TemplateField, answers?: Answers): string {
  const s = settingsOf(f);
  if (f.tickOnly) {
    let ticked = true;
    if (f.staffFill && answers) {
      const a = answers[`group:${f.group ?? ""}`];
      const chosen = Array.isArray(a) ? a : a ? [a] : [];
      ticked = chosen.includes(f.optionLabel ?? "");
    }
    const text = tickText(f);
    if (!text) return ticked ? "✓" : "";
    return `${ticked && (f.staffFill && answers) ? "☑" : "☐"} ${text}`;
  }
  const answer = f.staffFill && answers ? answers[f.linkTo || f.id] : undefined;
  if (f.type === "CHECKBOX" || f.type === "RADIO") {
    const opts = (s.options ?? []).filter(Boolean);
    if (!opts.length) return f.label;
    const picked = Array.isArray(answer) ? answer : answer ? [answer] : f.type === "RADIO" && s.defaultOption ? [s.defaultOption] : [];
    const [on, off] = f.type === "CHECKBOX" ? ["☑", "☐"] : ["●", "○"];
    return opts.map((o) => `${picked.includes(o) ? on : off} ${o}`).join("  ");
  }
  if (f.type === "DROPDOWN") return `${(typeof answer === "string" && answer) || s.defaultOption || f.label} ▾`;
  if (f.staffFill && answers) return typeof answer === "string" ? answer : "";
  return f.label;
}

/** Problems with staff answers on the New Contract form: {field id: message}. */
export function validateAnswers(fields: TemplateField[], answers: Answers): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const g of tickGroups(fields)) {
    const v = answers[g.key];
    if (g.mode === "one" && g.required && !(typeof v === "string" && v)) errors[g.key] = `Choose an answer for “${g.question}”.`;
  }
  for (const f of fields.filter((x) => x.staffFill && !x.tickOnly && !x.linkTo)) {
    const s = settingsOf(f);
    const v = answers[f.id];
    if (f.type === "CHECKBOX") continue; // ticking none is allowed
    const text = typeof v === "string" ? v.trim() : "";
    if (!text) {
      if (s.required !== false) errors[f.id] = `Fill in “${f.label}”.`;
      continue;
    }
    if (f.type === "NUMBER") {
      const n = Number(text);
      if (Number.isNaN(n)) errors[f.id] = `“${f.label}” must be a number.`;
      else if (s.minValue != null && n < s.minValue) errors[f.id] = `Must be at least ${s.minValue}.`;
      else if (s.maxValue != null && n > s.maxValue) errors[f.id] = `Must be at most ${s.maxValue}.`;
    }
    if (f.type === "TEXT" && s.characterLimit && text.length > s.characterLimit)
      errors[f.id] = `Keep it under ${s.characterLimit} characters.`;
  }
  return errors;
}

// ---------------- New Contract form = the template's own fields ----------------

/** One thing staff fill in on New Contract, taken from the template. */
export type FormItem =
  | { kind: "detail"; key: DataKey; label: string } // a data box (rent, dates, address…)
  | { kind: "staff"; field: TemplateField } // a "Filled by: Staff" field
  | { kind: "group"; group: TickGroup }; // staff tick boxes answered as one question

/** Reading order on the document: page, then top to bottom, then left to right. */
const docOrder = (a: TemplateField, b: TemplateField) =>
  a.page - b.page || a.positionY - b.positionY || a.positionX - b.positionX;

/** Tenant name + email are always asked (needed to send), so they aren't part of the template list. */
export const ALWAYS_ASKED: DataKey[] = ["tenant_name", "tenant_email"];

/** Everything staff fill in for this template, in document order, with the template's own labels. */
export function contractForm(fields: TemplateField[]): FormItem[] {
  const groups = new Map(tickGroups(fields).map((g) => [g.question, g]));
  const seen = new Set<string>();
  const items: FormItem[] = [];
  for (const f of [...fields].sort(docOrder)) {
    if (f.dataKey) {
      if (ALWAYS_ASKED.includes(f.dataKey) || seen.has(f.dataKey)) continue; // same detail printed twice → ask once
      seen.add(f.dataKey);
      items.push({ kind: "detail", key: f.dataKey, label: f.label });
    } else if (f.staffFill && f.tickOnly && f.group) {
      const g = groups.get(f.group);
      if (!g || seen.has(g.key)) continue;
      seen.add(g.key);
      items.push({ kind: "group", group: g });
    } else if (f.staffFill && !f.tickOnly && !f.linkTo) {
      items.push({ kind: "staff", field: f });
    }
  }
  return items;
}

/** The template's own label for each contract detail it prints. */
export function detailLabels(fields: TemplateField[]): Partial<Record<DataKey, string>> {
  const out: Partial<Record<DataKey, string>> = {};
  for (const f of [...fields].sort(docOrder)) if (f.dataKey && !out[f.dataKey]) out[f.dataKey] = f.label;
  return out;
}

/** Pre-selected options set in the template editor (radio / dropdown). */
export function defaultAnswers(fields: TemplateField[]): Answers {
  const out: Answers = {};
  for (const f of fields) {
    const d = settingsOf(f).defaultOption;
    if (f.staffFill && !f.linkTo && d && (f.type === "RADIO" || f.type === "DROPDOWN")) out[f.id] = d;
  }
  return out;
}

const answerText = (v: string | string[] | undefined) =>
  Array.isArray(v) ? (v.length ? v.join(", ") : "None ticked") : v || "Not answered";

/** A contract detail as it will print (e.g. "$350.00", "01/12/2026"). */
export function detailText(key: DataKey, c: Partial<Contract>): string {
  const v = c[key];
  if (v === undefined || v === null || v === "" || v === 0) return "Not set";
  if (key === "weekly_rent" || key === "bond_amount") return money(Number(v));
  if (key === "start_date" || key === "end_date") return date(String(v));
  return String(v);
}

/** Review step + contract page: exactly what the template asks for, with its labels, in document order. */
export function ContractSummary({
  fields,
  contract,
  templateName,
}: {
  fields: TemplateField[];
  contract: Partial<Contract>;
  templateName?: string | undefined;
}) {
  const answers = contract.custom_values ?? {};
  const rows: [string, string, boolean?][] = [
    ["Tenant", contract.tenant_name || "Not set"],
    ["Email address", contract.tenant_email || "Not set"],
    ...contractForm(fields).map((item): [string, string, boolean] =>
      item.kind === "detail"
        ? [item.label, detailText(item.key, contract), item.key === "property_address"]
        : item.kind === "group"
          ? [item.group.question, answerText(answers[item.group.key]), false]
          : [item.field.label, answerText(answers[item.field.id]), false],
    ),
  ];
  if (templateName) rows.push(["Template", templateName, true]);
  return (
    <dl className="detail-summary">
      {rows.map(([label, value, wide], i) => (
        <div key={`${label}-${i}`} className={wide ? "col-span-2" : ""}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FieldSettings({
  field,
  onChange,
  siblings,
  onChangeMany,
}: {
  field: TemplateField;
  onChange: (patch: Partial<TemplateField>) => void;
  /** All fields on the template (to group staff tick boxes by question). */
  siblings?: TemplateField[];
  onChangeMany?: (patches: Record<string, Partial<TemplateField>>) => void;
}) {
  const f = settingsOf(field);
  const s = supports(field);
  const options = f.options ?? [];
  const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
  const set = (patch: Settings) => onChange(patch as Partial<TemplateField>);
  const isSizedChoice = (field.type === "RADIO" || field.type === "CHECKBOX") && !field.tickOnly;

  if (field.tickOnly && field.staffFill)
    return <TickBoxSettings field={field} onChange={onChange} siblings={siblings ?? []} onChangeMany={onChangeMany} />;
  return (
    <div className="flex flex-col gap-4 mb-4">
      {field.tickOnly && (
        <p className="text-[11px] text-muted-foreground">
          Tick box: place it exactly over the box printed on the PDF. Zoom in and use the arrow keys (Shift for bigger
          steps) to line it up. The tenant ticks it when signing.
        </p>
      )}
      {field.tickOnly && <ShowTextToggle field={field} onChange={onChange} />}
      {s.placeholder && (
        <label className="field">
          Placeholder
          <small>Grey hint shown in the empty box</small>
          <input value={f.placeholder ?? ""} maxLength={100} onChange={(e) => set({ placeholder: e.target.value })} />
        </label>
      )}

      {s.options && <OptionsEditor field={field} onChange={onChange} />}

      {s.defaultOption && (
        <label className="field">
          Pre-selected option
          <select value={f.defaultOption ?? ""} onChange={(e) => set({ defaultOption: e.target.value || null })}>
            <option value="">None</option>
            {options.filter((o) => o.trim()).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
      )}

      {s.direction && (
        <Row label="Layout">
          <Segmented
            value={f.direction ?? "vertical"}
            options={[["vertical", "Stacked"], ["horizontal", "In a row"]]}
            onChange={(v) => set({ direction: v as "vertical" | "horizontal" })}
          />
        </Row>
      )}

      {s.minMax && (
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            Minimum
            <input type="number" value={f.minValue ?? ""} onChange={(e) => set({ minValue: num(e.target.value) })} />
          </label>
          <label className="field">
            Maximum
            <input type="number" value={f.maxValue ?? ""} onChange={(e) => set({ maxValue: num(e.target.value) })} />
          </label>
        </div>
      )}

      {s.characterLimit && (
        <label className="field">
          Character limit
          <small>Leave empty for no limit</small>
          <input
            type="number"
            min={1}
            value={f.characterLimit ?? ""}
            onChange={(e) => {
              const n = num(e.target.value);
              set({ characterLimit: n && n > 0 ? Math.round(n) : null });
            }}
          />
        </label>
      )}

      {(s.fontSize || s.textAlign) && (
        <div className="grid grid-cols-2 gap-3">
          {s.fontSize && (
            <label className="field">
              {isSizedChoice ? "Button size" : "Font size"}
              {isSizedChoice && <small>Auto grows with the box — drag its corner</small>}
              <select
                value={f.fontSize ?? ""}
                onChange={(e) => set({ fontSize: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">{isSizedChoice ? `Auto (${choiceFontSize({ ...field, fontSize: null } as TemplateField)})` : "Default"}</option>
                {FONT_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          )}
          {s.textAlign && (
            <Row label="Align">
              <Segmented
                value={f.textAlign ?? "left"}
                options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]}
                onChange={(v) => set({ textAlign: v as "left" | "center" | "right" })}
              />
            </Row>
          )}
        </div>
      )}

      {s.required && (
        <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-xs">
          <span>
            <span className="font-medium">Required</span>
            <span className="block text-muted-foreground">
              {f.staffFill ? "Staff must answer this when creating a contract" : "The tenant must complete this to sign"}
            </span>
          </span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={f.required !== false}
            onChange={(e) => set({ required: e.target.checked })}
          />
        </label>
      )}
      {field.type === "SIGNATURE" && (
        <p className="text-[11px] text-muted-foreground">Signature boxes are always required.</p>
      )}
      {field.staffFill && !field.tickOnly && (
        <StaffExtras field={field} onChange={onChange} siblings={siblings ?? []} />
      )}
      {field.dataKey && (
        <p className="text-[11px] text-muted-foreground">
          Filled in automatically from the contract. The tenant can see it but can’t change it.
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      {label}
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-md border border-border p-0.5">
      {options.map(([v, label]) => (
        <button
          type="button"
          key={v}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Staff tick box: which question it belongs to and what ticking it means. */
/** Text printed next to a tick box ("" = box only). */
export function tickText(f: TemplateField): string {
  if (!f.tickOnly || !f.showText) return "";
  return ((f.staffFill ? f.optionLabel : f.label) ?? "").trim();
}

const TICK_WIDTH = 2; // % of the page — the box alone

/** "Show text on document" switch for tick boxes. Widens the box to fit the text. */
function ShowTextToggle({ field, onChange }: { field: TemplateField; onChange: (patch: Partial<TemplateField>) => void }) {
  const text = ((field.staffFill ? field.optionLabel : field.label) ?? "").trim();
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-xs">
      <span>
        <span className="font-medium">Show text on document</span>
        <span className="block text-muted-foreground">
          {field.staffFill ? "Print “This box means”" : "Print the field label"} next to the box
          {text ? ` (e.g. ☐ ${text})` : ""}. Leave off when the PDF already has the text.
        </span>
      </span>
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={Boolean(field.showText)}
        onChange={(e) => {
          const on = e.target.checked;
          const width = on
            ? Math.max(field.width, TICK_WIDTH + Math.max(3, text.length * 1.1))
            : TICK_WIDTH;
          onChange({ showText: on, width: Math.min(width, 100 - field.positionX) });
        }}
      />
    </label>
  );
}

function TickBoxSettings({
  field,
  onChange,
  siblings,
  onChangeMany,
}: {
  field: TemplateField;
  onChange: (patch: Partial<TemplateField>) => void;
  siblings: TemplateField[];
  onChangeMany?: ((patches: Record<string, Partial<TemplateField>>) => void) | undefined;
}) {
  const questions = [...new Set(siblings.filter((f) => f.tickOnly && f.staffFill && f.group).map((f) => f.group!))];
  const sameGroup = siblings.filter((f) => f.tickOnly && f.staffFill && f.group && f.group === field.group);
  const listId = `tick-questions-${field.id}`;
  const label = (group?: string, option?: string) => [group, option].filter(Boolean).join(": ") || "Tick box";
  return (
    <div className="flex flex-col gap-4 mb-4">
      <p className="text-[11px] text-muted-foreground">
        Place this box exactly over a box printed on the PDF (zoom in, then use the arrow keys — Shift for bigger steps).
        Staff choose the answer on the New Contract form; only the chosen box is ticked.
      </p>
      <label className="field">
        Question
        <small>Boxes with the same question are answered together</small>
        <input
          list={listId}
          value={field.group ?? ""}
          placeholder="e.g. Furnished"
          maxLength={100}
          onChange={(e) => onChange({ group: e.target.value, label: label(e.target.value, field.optionLabel) })}
        />
        <datalist id={listId}>
          {questions.map((q) => (
            <option key={q} value={q} />
          ))}
        </datalist>
      </label>
      <label className="field">
        This box means
        <input
          value={field.optionLabel ?? ""}
          placeholder="e.g. Yes"
          maxLength={100}
          onChange={(e) => onChange({ optionLabel: e.target.value, label: label(field.group, e.target.value) })}
        />
      </label>
      <div className="field">
        Staff can choose
        <div className="mt-1">
          <Segmented
            value={field.groupMode ?? "one"}
            options={[["one", "One box"], ["any", "Any boxes"]]}
            onChange={(v) => {
              const mode = v as "one" | "any";
              // Same answer type for every box in this question.
              if (onChangeMany && sameGroup.length)
                onChangeMany(Object.fromEntries(sameGroup.map((f) => [f.id, { groupMode: mode }])));
              else onChange({ groupMode: mode });
            }}
          />
        </div>
      </div>
      <ShowTextToggle field={field} onChange={onChange} />
      {sameGroup.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          “{field.group}” has {sameGroup.length} box{sameGroup.length === 1 ? "" : "es"}:{" "}
          {sameGroup.map((f) => f.optionLabel || "?").join(" · ")}
        </p>
      )}
    </div>
  );
}

// ---------------- Dropdown / radio / checkbox answer choices ----------------

/** Ready-made answer lists for the choices Living High uses most. */
const PRESETS: { name: string; options: string[] }[] = [
  { name: "Yes / No", options: ["Yes", "No"] },
  { name: "Weeks / Months", options: ["Weeks", "Months"] },
  { name: "Numbers 1–12", options: Array.from({ length: 12 }, (_, i) => String(i + 1)) },
  { name: "Notice period", options: ["1 Week", "2 Weeks", "3 Weeks", "4 Weeks"] },
  { name: "Deposit (weeks)", options: ["2 Weeks", "3 Weeks", "4 Weeks"] },
  { name: "Minimum stay", options: ["3 Months", "6 Months", "9 Months", "12 Months"] },
];

function OptionsEditor({ field, onChange }: { field: TemplateField; onChange: (patch: Partial<TemplateField>) => void }) {
  const f = settingsOf(field);
  const options = f.options ?? [];
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const set = (patch: Settings) => onChange(patch as Partial<TemplateField>);
  const setOptions = (next: string[]) =>
    set({ options: next, ...(f.defaultOption && !next.includes(f.defaultOption) ? { defaultOption: null } : {}) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOptions(next);
  };

  return (
    <div className="field">
      <span className="flex items-center justify-between">
        Answer choices
        <span className="text-[10px] text-muted-foreground font-normal">{options.length} / 30</span>
      </span>
      <div className="flex flex-col gap-2 mt-1">
        <select
          aria-label="Use a ready-made list"
          className="w-full"
          value=""
          onChange={(e) => {
            const preset = PRESETS.find((p) => p.name === e.target.value);
            if (preset) setOptions([...preset.options]);
          }}
        >
          <option value="">Use a ready-made list…</option>
          {PRESETS.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            setPasteText(options.join("\n"));
            setPasting(!pasting);
          }}
        >
          <ClipboardList />
          {pasting ? "Cancel" : "Paste list"}
        </Button>
      </div>

      {pasting ? (
        <div className="flex flex-col gap-2 mt-2">
          <textarea
            rows={6}
            aria-label="Answer choices, one per line"
            placeholder={"One answer per line, e.g.\n2 Weeks\n3 Weeks\n4 Weeks"}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => {
              const next = [...new Set(pasteText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))].slice(0, 30);
              if (next.length) setOptions(next);
              setPasting(false);
            }}
          >
            Use these answers
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 mt-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                className="min-w-0 flex-1"
                aria-label={`Answer ${i + 1}`}
                value={opt}
                maxLength={100}
                onChange={(e) => {
                  const next = [...options];
                  const old = next[i];
                  next[i] = e.target.value;
                  set({ options: next, ...(f.defaultOption === old ? { defaultOption: e.target.value } : {}) });
                }}
              />
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Move answer ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ChevronUp size={14} />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Move answer ${i + 1} down`} disabled={i === options.length - 1} onClick={() => move(i, 1)}>
                <ChevronDown size={14} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label={`Remove answer ${i + 1}`}
                disabled={options.length <= 1}
                onClick={() => setOptions(options.filter((_, j) => j !== i))}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
          {options.length < 30 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => set({ options: [...options, `Option ${options.length + 1}`] })}
            >
              <Plus />
              Add answer
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- Who fills the field (PandaDoc "Assign to") ----------------

const SWITCHABLE = ["TEXT", "NUMBER", "DROPDOWN", "RADIO", "CHECKBOX"];

/** Switch a placed field between "Tenant fills in" and "Staff fill in before sending". */
export function FilledBySwitch({
  field,
  onChange,
}: {
  field: TemplateField;
  onChange: (patch: Partial<TemplateField>) => void;
}) {
  if (field.dataKey || !SWITCHABLE.includes(field.type)) return null;
  return (
    <div className="field mb-4">
      Filled by
      <div className="mt-1">
        <Segmented
          value={field.staffFill ? "staff" : "tenant"}
          options={[["tenant", "Tenant"], ["staff", "Staff (before sending)"]]}
          onChange={(v) =>
            onChange(
              v === "staff"
                ? { staffFill: true, ...(field.tickOnly ? { group: field.group ?? "", optionLabel: field.optionLabel ?? "", groupMode: field.groupMode ?? "one" } : {}) }
                : { staffFill: false, linkTo: null, tenantEditable: false },
            )
          }
        />
      </div>
    </div>
  );
}

/** Staff-filled fields: link to another field, and whether the tenant may change the answer. */
function StaffExtras({
  field,
  onChange,
  siblings,
}: {
  field: TemplateField;
  onChange: (patch: Partial<TemplateField>) => void;
  siblings: TemplateField[];
}) {
  const f = settingsOf(field);
  const candidates = siblings.filter(
    (s) => s.id !== field.id && s.staffFill && !s.tickOnly && !s.linkTo && s.type === field.type,
  );
  const linkedFrom = siblings.filter((s) => s.linkTo === field.id);
  return (
    <div className="flex flex-col gap-3">
      {(candidates.length > 0 || f.linkTo) && (
        <label className="field">
          <span className="flex items-center gap-1.5">
            <Link2 size={13} />
            Same answer as
          </span>
          <small>Staff answer once; it’s printed in every linked place</small>
          <select
            value={f.linkTo ?? ""}
            onChange={(e) => {
              const target = siblings.find((s) => s.id === e.target.value);
              onChange(
                target
                  ? ({ linkTo: target.id, options: settingsOf(target).options ?? null, defaultOption: settingsOf(target).defaultOption ?? null } as Partial<TemplateField>)
                  : ({ linkTo: null } as Partial<TemplateField>),
              );
            }}
          >
            <option value="">Not linked — its own answer</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.label} (page {c.page})</option>
            ))}
          </select>
        </label>
      )}
      {f.linkTo && (
        <p className="text-[11px] text-muted-foreground">
          Uses the answer (and choices) of the field it’s linked to. Staff won’t be asked for it separately.
        </p>
      )}
      {linkedFrom.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {linkedFrom.length} other field{linkedFrom.length === 1 ? "" : "s"} show{linkedFrom.length === 1 ? "s" : ""} this answer too.
        </p>
      )}
      <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-xs">
        <span>
          <span className="font-medium">Tenant can change the answer</span>
          <span className="block text-muted-foreground">Off: locked on the agreement. On: pre-filled, the tenant may change it.</span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={Boolean(f.tenantEditable)}
          onChange={(e) => onChange({ tenantEditable: e.target.checked } as Partial<TemplateField>)}
        />
      </label>
      <p className="text-[11px] text-muted-foreground">Staff answer this on the New Contract form.</p>
    </div>
  );
}
