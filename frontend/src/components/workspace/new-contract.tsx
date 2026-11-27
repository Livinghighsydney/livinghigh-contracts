import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ArrowRight,
  ArrowLeft,
  FileText,
  UserRound,
  Send,
  Save,
  AlertCircle,
  LoaderCircle,
  ListChecks,
} from "lucide-react";
import {
  ContractSummary,
  contractForm,
  defaultAnswers,
  detailLabels,
  validateAnswers,
  settingsOf,
  type Answers,
  type TickGroup,
} from "./field-settings";
import { Button } from "@/components/ui/button";
import { PageHeader, Status, Empty, UnsavedWarning } from "./common";
import { PdfPreview } from "./pdf-preview";
import { templateApi } from "@/api/templates";
import { contractApi, SendError } from "@/api/contracts";
import type { Contract, DataKey, TemplateField } from "@/api/types";
import { useResourceVersion } from "@/api/store";
import { fieldValue, validateDetails } from "@/lib/contracts";
import { toast } from "sonner";
type Details = Omit<
  Contract,
  "id" | "status" | "template_key" | "created_by" | "created_at" | "updated_at"
>;
const initial: Details = {
  tenant_name: "",
  tenant_email: "",
  property_address: "",
  room_number: "",
  weekly_rent: 0,
  bond_amount: 0,
  start_date: "",
  end_date: "",
};
export function NewContract({ duplicateId }: { duplicateId?: string }) {
  useResourceVersion();
  const navigate = useNavigate();
  const original = duplicateId ? contractApi.get(duplicateId) : undefined;
  const [step, setStep] = useState(original ? 2 : 1);
  const [key, setKey] = useState(original?.template_key ?? "");
  const [details, setDetails] = useState<Details>(
    original
      ? {
          tenant_name: original.tenant_name,
          tenant_email: original.tenant_email,
          property_address: original.property_address,
          room_number: original.room_number ?? "",
          weekly_rent: original.weekly_rent,
          bond_amount: original.bond_amount,
          start_date: original.start_date,
          end_date: original.end_date ?? "",
          custom_values: original.custom_values ?? {},
        }
      : initial,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState("Your agreement from Living High");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  // Always work from the latest version of the templates (they may have just been edited).
  useEffect(() => {
    void templateApi.refresh();
  }, []);
  const templates = templateApi.list().filter((t) => t.status === "ready");
  const template = templateApi.get(key);
  const allFields = template?.fields ?? [];
  // The form mirrors the template: its fields, its labels, in document order.
  const items = contractForm(allFields);
  const labels = detailLabels(allFields);
  const used = new Set(items.flatMap((i) => (i.kind === "detail" ? [i.key] : [])));
  const blanks = allFields.filter((f) => f.dataKey && !fieldValue(f, details));
  // Pre-selected options from the template editor, unless staff changed them.
  const answers: Answers = { ...defaultAnswers(allFields), ...(details.custom_values ?? {}) };
  const setAnswer = (id: string, value: string | string[]) => {
    setDetails({ ...details, custom_values: { ...answers, [id]: value } });
    if (errors[`custom:${id}`]) setErrors({ ...errors, [`custom:${id}`]: "" });
  };
  const set = (name: Exclude<keyof Details, "custom_values">, value: string) =>
    setDetails({
      ...details,
      [name]: name === "weekly_rent" || name === "bond_amount" ? Number(value) : value,
    });
  async function submit(status: "draft" | "sent") {
    if (!template || busy) return;
    setBusy(true);
    try {
      const c = await contractApi.create(
        { ...details, custom_values: answers, template_key: key, status },
        { subject: subject || "Your agreement from Living High", message },
      );
      setSaved(true);
      toast.success(
        status === "sent"
          ? c.status === "queued"
            ? "Documenso is busy. The contract is queued and will be sent automatically in a few minutes."
            : `Contract sent. ${details.tenant_email} will receive the signing link by email.`
          : "Draft saved.",
      );
      void navigate({ to: "/contracts/$id", params: { id: c.id } });
    } catch (e) {
      if (e instanceof SendError) {
        // The contract was saved; open it so staff can resend instead of creating a duplicate.
        setSaved(true);
        toast.error(e.message);
        void navigate({ to: "/contracts/$id", params: { id: e.contractId } });
        return;
      }
      toast.error(
        e instanceof Error ? e.message : "Could not save the contract. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function next() {
    if (step === 2) {
      const custom = Object.fromEntries(
        Object.entries(validateAnswers(allFields, answers)).map(([k, v]) => [`custom:${k}`, v]),
      );
      const e = { ...validateDetails(details, used, labels), ...custom };
      setErrors(e);
      if (Object.keys(e).length) return;
    }
    setStep(step + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const DETAIL_INPUT: Record<string, { type: string; optional?: boolean; placeholder?: string }> = {
    property_address: { type: "text", placeholder: "Street address, suburb and postcode" },
    room_number: { type: "text", optional: true, placeholder: "e.g. 02" },
    weekly_rent: { type: "number", placeholder: "0.00" },
    bond_amount: { type: "number", placeholder: "0.00" },
    start_date: { type: "date" },
    end_date: { type: "date", optional: true },
  };
  const field = (
    label: string,
    name: Exclude<keyof Details, "custom_values">,
    type = "text",
    optional = false,
    placeholder?: string,
    hint?: string,
  ) => (
    <label key={name} className={`field ${name === "property_address" ? "full" : ""}`}>
      {label}
      {(optional || hint) && <small>{optional ? "Optional" : hint}</small>}
      <input
        aria-label={label}
        type={type}
        value={
          (name === "weekly_rent" || name === "bond_amount") && details[name] === 0
            ? ""
            : (details[name] ?? "")
        }
        {...(type === "number" ? { min: 0.01, step: 0.01 } : {})}
        onChange={(e) => {
          set(name, e.target.value);
          if (errors[name]) setErrors({ ...errors, [name]: "" });
        }}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        placeholder={placeholder}
      />
      {errors[name] && (
        <span id={`${name}-error`} className="field-error">
          {errors[name]}
        </span>
      )}
    </label>
  );
  const detailInput = (key: DataKey, label: string) => {
    const spec = DETAIL_INPUT[key] ?? { type: "text" };
    return field(label, key as Exclude<keyof Details, "custom_values">, spec.type, spec.optional, spec.placeholder);
  };
  const groupInput = (g: TickGroup) => {
    const v = answers[g.key];
    const err = errors[`custom:${g.key}`];
    const picked = Array.isArray(v) ? v : [];
    return (
      <div key={g.key} className={`field ${g.options.length > 3 ? "full" : ""}`}>
        <span>
          {g.question}
          {(g.mode === "any" || !g.required) && <small> Optional</small>}
        </span>
        <div role={g.mode === "one" ? "radiogroup" : "group"} aria-label={g.question} className="flex flex-wrap gap-4 mt-1">
          {g.options.map((o) =>
            g.mode === "one" ? (
              <label key={o} className="flex items-center gap-2 text-sm font-normal whitespace-nowrap">
                <input type="radio" name={g.key} checked={v === o} onChange={() => setAnswer(g.key, o)} />
                {o}
              </label>
            ) : (
              <label key={o} className="flex items-center gap-2 text-sm font-normal whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={picked.includes(o)}
                  onChange={(e) => setAnswer(g.key, e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))}
                />
                {o}
              </label>
            ),
          )}
        </div>
        {err && <span className="field-error">{err}</span>}
      </div>
    );
  };
  const staffInput = (f: TemplateField) => {
    const st = settingsOf(f);
    const opts = (st.options ?? []).filter(Boolean);
    const v = answers[f.id];
    const err = errors[`custom:${f.id}`];
    const optional = f.type === "CHECKBOX" || st.required === false;
    const picked = Array.isArray(v) ? v : [];
    return (
      <div key={f.id} className={`field ${f.type === "CHECKBOX" || opts.length > 3 ? "full" : ""}`}>
        <span>
          {f.label}
          {optional && <small> Optional</small>}
        </span>
        {f.type === "RADIO" && (
          <div role="radiogroup" aria-label={f.label} className="flex flex-wrap gap-4 mt-1">
            {opts.map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm font-normal whitespace-nowrap">
                <input type="radio" name={`custom-${f.id}`} checked={v === o} onChange={() => setAnswer(f.id, o)} />
                {o}
              </label>
            ))}
          </div>
        )}
        {f.type === "CHECKBOX" && (
          <div className="flex flex-wrap gap-4 mt-1">
            {opts.map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm font-normal whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={picked.includes(o)}
                  onChange={(e) => setAnswer(f.id, e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))}
                />
                {o}
              </label>
            ))}
          </div>
        )}
        {f.type === "DROPDOWN" && (
          <select aria-label={f.label} value={typeof v === "string" ? v : ""} onChange={(e) => setAnswer(f.id, e.target.value)}>
            <option value="">{st.placeholder || "Choose…"}</option>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
        {f.type === "TEXT" && f.dateInput && (
          <input
            aria-label={f.label}
            type="date"
            // stored as dd/mm/yyyy (how it prints); the picker needs yyyy-mm-dd
            value={typeof v === "string" ? v.split("/").reverse().join("-") : ""}
            onChange={(e) => setAnswer(f.id, e.target.value ? e.target.value.split("-").reverse().join("/") : "")}
          />
        )}
        {((f.type === "TEXT" && !f.dateInput) || f.type === "NUMBER") && (
          <input
            aria-label={f.label}
            type={f.type === "NUMBER" ? "number" : "text"}
            value={typeof v === "string" ? v : ""}
            placeholder={st.placeholder ?? undefined}
            {...(f.type === "NUMBER" && st.minValue != null ? { min: st.minValue } : {})}
            {...(f.type === "NUMBER" && st.maxValue != null ? { max: st.maxValue } : {})}
            {...(f.type === "TEXT" && st.characterLimit ? { maxLength: st.characterLimit } : {})}
            onChange={(e) => setAnswer(f.id, e.target.value)}
          />
        )}
        {err && <span className="field-error">{err}</span>}
      </div>
    );
  };
  return (
    <main className="page">
      <UnsavedWarning dirty={!saved && (Boolean(key) || Boolean(details.tenant_name))} />
      <PageHeader
        title={original ? "Duplicate contract" : "New contract"}
        eyebrow="A new beginning"
        subtitle={
          step === 1
            ? "Choose an agreement to get started."
            : step === 2
              ? "A few details, then you’re ready to send."
              : "One final check before it goes to your tenant."
        }
      />
      <div className="stepper" aria-label="Contract progress">
        {["Choose template", "Tenant details", "Review & send"].map((s, i) => (
          <div key={s} className="contents">
            {i > 0 && <div className="step-line" />}
            <div
              className={`step ${step >= i + 1 ? "active" : ""}`}
              aria-current={step === i + 1 ? "step" : undefined}
            >
              <span className="step-number">{step > i + 1 ? <Check size={12} /> : i + 1}</span>
              {s}
            </div>
          </div>
        ))}
      </div>
      {step === 1 && (
        <>
          <div className="template-grid">
            {templates.map((t) => (
              <div
                key={t.id}
                role="radio"
                aria-checked={key === t.template_key}
                tabIndex={0}
                className={`template-card cursor-pointer ${key === t.template_key ? "is-selected" : ""}`}
                onClick={() => setKey(t.template_key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setKey(t.template_key);
                  }
                }}
              >
                <div className="flex justify-between">
                  <div className="template-document">
                    <FileText />
                  </div>
                  {key === t.template_key && <Check size={18} className="text-primary" />}
                </div>
                <h3>{t.name}</h3>
                <p>{t.description}</p>
                <div className="flex justify-between items-center mt-auto">
                  <Status status={t.status} />
                  <span className="text-[11px] text-muted-foreground">{t.field_count} fields</span>
                </div>
              </div>
            ))}
          </div>
          {!templates.length && (
            <Empty
              title="No ready templates"
              description="Set up a template with a signature box first."
            >
              <Button onClick={() => void navigate({ to: "/templates" })}>Go to templates</Button>
            </Empty>
          )}
        </>
      )}
      {step === 2 && (
        <div className="form-layout">
          <div className="notice">
            <FileText size={16} />
            {template?.name ?? "Choose a ready template before sending."}
          </div>
          <div className="form-group">
            <h2>
              <UserRound size={17} />
              Tenant
            </h2>
            <div className="form-grid">
              {field("Full name", "tenant_name", "text", false, "e.g. Sophie Williams", "Needed to send the signing link")}
              {field("Email address", "tenant_email", "email", false, "e.g. sophie@email.com", "The signing link is sent here")}
            </div>
          </div>
          {items.length > 0 && (
            <div className="form-group">
              <h2>
                <ListChecks size={17} />
                {template?.name ? `${template.name} details` : "Agreement details"}
              </h2>
              <p className="text-[11px] text-muted-foreground -mt-2 mb-4">
                In the same order as on the agreement. Printed on it before sending — the tenant can see these but
                can’t change them.
              </p>
              <div className="form-grid">
                {items.map((item) =>
                  item.kind === "detail"
                    ? detailInput(item.key, item.label)
                    : item.kind === "group"
                      ? groupInput(item.group)
                      : staffInput(item.field),
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {step === 3 && template && (
        <div className="review-grid">
          <PdfPreview template={template} contract={{ ...details, custom_values: answers }} />
          <div>
            <h2 className="section-title">Agreement summary</h2>
            <ContractSummary
              fields={template.fields}
              contract={{ ...details, custom_values: answers }}
              templateName={template.name}
            />
            {blanks.length > 0 && (
              <div className="notice warning mt-6">
                <AlertCircle size={18} />
                <div>
                  Some boxes are blank: {blanks.map((f) => f.label).join(", ")}. Add these details
                  before sending.
                </div>
              </div>
            )}
            <div className="summary-band">
              <h2 className="section-title mb-5">Email to your tenant</h2>
              <label className="field mb-4">
                Subject <small>Optional</small>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label className="field">
                Personal message <small>Optional</small>
                <textarea
                  rows={4}
                  placeholder="Hi Sophie, here’s your agreement. We’re looking forward to welcoming you."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
            </div>
            <div className="flex flex-col gap-3 mt-6">
              <Button
                disabled={busy || blanks.length > 0}
                onClick={() => void submit("sent")}
                className="h-auto min-h-10 whitespace-normal break-all"
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Send />}Send to{" "}
                {details.tenant_email}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void submit("draft")}>
                <Save />
                Save as draft
              </Button>
              <small className="text-muted-foreground text-[10px] text-center">
                Sent from Living High’s email with a personal signing link
              </small>
            </div>
          </div>
        </div>
      )}
      <div className="form-actions">
        <Button
          variant="outline"
          onClick={() => {
            if (step > 1) setStep(step - 1);
            else if (!key || window.confirm("Leave this contract? Your changes won’t be saved."))
              void navigate({ to: "/" });
          }}
        >
          <ArrowLeft />
          {step === 1 ? "Cancel" : "Back"}
        </Button>
        {step < 3 && (
          <Button disabled={!key || busy} onClick={next}>
            Continue
            <ArrowRight />
          </Button>
        )}
      </div>
    </main>
  );
}
