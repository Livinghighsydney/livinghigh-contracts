import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { contractsApi } from "../api/contracts";
import { templatesApi, type Template } from "../api/templates";
import { useTemplates } from "../hooks/useTemplates";
import { ContractForm, validateDetails } from "../components/ContractForm";
import { ContractPreview } from "../components/ContractPreview";
import { Button } from "../components/ui/Button";
import {
  DATA_LABELS, dataValue, emptyDetails, formatDate, formatMoney,
  type ContractDetailsForm,
} from "../utils/format";

type Step = 1 | 2 | 3;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Choose template" },
  { n: 2, label: "Tenant details" },
  { n: 3, label: "Review & send" },
];

export function NewContract() {
  const navigate = useNavigate();
  const { templates, loading: templatesLoading, error: templatesError } = useTemplates();

  const [step, setStep] = useState<Step>(1);
  const [template, setTemplate] = useState<Template | null>(null);
  const [details, setDetails] = useState<ContractDetailsForm>(emptyDetails);
  const [showErrors, setShowErrors] = useState(false);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const [sending, setSending] = useState<"send" | "draft" | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  // Once a draft exists we reuse it, so a retry never creates a duplicate contract.
  const [draftId, setDraftId] = useState<string | null>(null);

  const readyTemplates = templates.filter(
    (t) => t.is_active && t.documenso_template_id && (t.fields_json?.length ?? 0) > 0,
  );
  const formErrors = validateDetails(details);

  // Data boxes on this template that will print blank.
  const blankBoxes = useMemo(() => {
    if (!template) return [];
    const keys = new Set(
      template.fields_json.filter((f) => f.dataKey && !dataValue(f.dataKey, details)).map((f) => f.dataKey!),
    );
    return [...keys].map((k) => DATA_LABELS[k]);
  }, [template, details]);

  // Load the template PDF when reaching the review step.
  useEffect(() => {
    if (step !== 3 || !template) return;
    setPdfUrl(null);
    setPdfError(null);
    templatesApi.getPdfUrl(template.id)
      .then(({ url }) => setPdfUrl(url))
      .catch((e: Error) => setPdfError(e.message));
  }, [step, template]);

  const goToReview = () => {
    if (formErrors.length) { setShowErrors(true); return; }
    setStep(3);
    window.scrollTo(0, 0);
  };

  const submit = async (mode: "send" | "draft") => {
    if (!template) return;
    setSending(mode);
    setSendError(null);
    try {
      let id = draftId;
      if (!id) {
        const res = await contractsApi.create({
          template_key: template.template_key,
          tenant_name: details.tenant_name.trim(),
          tenant_email: details.tenant_email.trim(),
          property_address: details.property_address.trim(),
          room_number: details.room_number.trim() || undefined,
          weekly_rent: Number(details.weekly_rent),
          bond_amount: Number(details.bond_amount),
          start_date: details.start_date,
          end_date: details.end_date || undefined,
          created_by: "staff",
        });
        id = res.id;
        setDraftId(id);
      }
      if (mode === "send") {
        await contractsApi.send(id, {
          email_subject: subject.trim() || undefined,
          email_message: message.trim() || undefined,
        });
      }
      navigate(`/contracts/${id}`);
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSending(null);
    }
  };

  return (
    <div className={`mx-auto px-4 py-8 ${step === 3 ? "max-w-6xl" : "max-w-2xl"}`}>
      <div className="mb-2 text-sm text-gray-500">
        <Link to="/contracts" className="hover:underline">Contracts</Link> / New contract
      </div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New contract</h1>

      <StepBar current={step} />

      {/* ---------- Step 1: template ---------- */}
      {step === 1 && (
        <div className="mt-8">
          {templatesLoading && <p className="text-sm text-gray-400">Loading templates…</p>}
          {templatesError && <p className="text-sm text-red-600">{templatesError}</p>}
          {!templatesLoading && readyTemplates.length === 0 && (
            <p className="rounded-md bg-yellow-50 p-4 text-sm text-yellow-800">
              No templates are ready yet.{" "}
              <Link to="/templates" className="font-medium underline">Set one up on the Templates page.</Link>
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {readyTemplates.map((t) => {
              const isSel = template?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t)}
                  onDoubleClick={() => { setTemplate(t); setStep(2); }}
                  className={`rounded-lg border-2 bg-white p-4 text-left transition ${
                    isSel ? "border-blue-600 ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <DocIcon selected={isSel} />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{t.name}</p>
                      {t.description && <p className="mt-0.5 text-sm text-gray-500">{t.description}</p>}
                      <p className="mt-2 text-xs text-gray-400">{t.fields_json.length} fields</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-8 flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!template}>Next: tenant details →</Button>
          </div>
        </div>
      )}

      {/* ---------- Step 2: details ---------- */}
      {step === 2 && template && (
        <div className="mt-8">
          <p className="mb-4 text-sm text-gray-500">
            Template: <span className="font-medium text-gray-900">{template.name}</span>
          </p>
          <ContractForm value={details} onChange={(d) => { setDetails(d); setDraftId(null); }} />
          {showErrors && formErrors.length > 0 && (
            <ul className="mt-4 list-inside list-disc rounded-md bg-red-50 p-3 text-sm text-red-700">
              {formErrors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <div className="mt-8 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>← Back</Button>
            <Button onClick={goToReview}>Next: review →</Button>
          </div>
        </div>
      )}

      {/* ---------- Step 3: review & send ---------- */}
      {step === 3 && template && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 rounded-lg bg-gray-100 p-6">
            <p className="mb-4 text-center text-xs text-gray-500">
              Preview — this is how the tenant will see the agreement.
              <span className="ml-2 inline-block h-2 w-2 rounded-full bg-amber-400" /> filled from the details you entered
              <span className="ml-2 inline-block h-2 w-2 rounded-full bg-blue-500" /> the tenant fills in
            </p>
            {pdfError && <p className="text-center text-sm text-red-600">{pdfError}</p>}
            {pdfUrl && (
              <ContractPreview pdfUrl={pdfUrl} fields={template.fields_json} details={details} width={620} />
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-lg border border-gray-200 bg-white p-5 text-sm">
              <h3 className="mb-3 font-semibold text-gray-900">Summary</h3>
              <dl className="space-y-2">
                <Row label="Template" value={template.name} />
                <Row label="Tenant" value={details.tenant_name} />
                <Row label="Email" value={details.tenant_email} />
                <Row label="Property" value={[details.property_address, details.room_number && `Room ${details.room_number}`].filter(Boolean).join(", ")} />
                <Row label="Weekly rent" value={formatMoney(details.weekly_rent)} />
                <Row label="Bond" value={formatMoney(details.bond_amount)} />
                <Row label="Dates" value={`${formatDate(details.start_date)}${details.end_date ? ` – ${formatDate(details.end_date)}` : " (no end date)"}`} />
              </dl>
              {!draftId && (
                <button onClick={() => setStep(2)} className="mt-3 text-xs text-blue-600 hover:underline">
                  Edit details
                </button>
              )}
            </div>

            {blankBoxes.length > 0 && (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                These boxes on the agreement will be blank: <b>{blankBoxes.join(", ")}</b>. Go back and fill them in if needed.
              </p>
            )}

            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="font-semibold text-gray-900">Email to tenant</h3>
              <p className="mb-3 text-xs text-gray-500">Sent from Living High's email with the signing link. Optional — leave blank for the standard wording.</p>
              <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="email_subject">Subject</label>
              <input
                id="email_subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={255}
                placeholder={`Please sign: ${template.name}`}
                className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="email_message">Message</label>
              <textarea
                id="email_message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder={`Hi ${details.tenant_name.split(" ")[0] || "there"}, please review and sign your agreement.`}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {sendError && (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {sendError}
                {draftId && <> <Link className="font-medium underline" to={`/contracts/${draftId}`}>Open the contract</Link></>}
              </p>
            )}

            <Button onClick={() => submit("send")} loading={sending === "send"} disabled={!!sending} className="w-full py-2.5">
              Send to {details.tenant_email || "tenant"}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep(2)} disabled={!!sending || !!draftId} className="flex-1">
                ← Back
              </Button>
              <Button variant="secondary" onClick={() => submit("draft")} loading={sending === "draft"} disabled={!!sending} className="flex-1">
                Save as draft
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function StepBar({ current }: { current: Step }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <li key={s.n} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done ? "bg-blue-600 text-white" : active ? "border-2 border-blue-600 text-blue-600" : "border-2 border-gray-300 text-gray-400"
              }`}
            >
              {done ? "✓" : s.n}
            </span>
            <span className={`whitespace-nowrap text-sm ${active ? "font-medium text-gray-900" : "text-gray-500"}`}>{s.label}</span>
            {i < STEPS.length - 1 && <span className={`h-px flex-1 ${done ? "bg-blue-600" : "bg-gray-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="truncate text-right font-medium text-gray-900" title={value}>{value || "—"}</dd>
    </div>
  );
}

function DocIcon({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-8 w-8 shrink-0 ${selected ? "text-blue-600" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}
