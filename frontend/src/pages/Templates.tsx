import { useState, useRef, FormEvent } from "react";
import { useTemplates } from "../hooks/useTemplates";
import { templatesApi } from "../api/templates";
import type { Template, TemplateField } from "../api/templates";
import { FieldPlacer } from "../components/FieldPlacer";
import { Button } from "../components/ui/Button";

export function Templates() {
  const { templates, loading, error, reload } = useTemplates();
  const [showForm, setShowForm]     = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [name, setName]               = useState("");
  const [key, setKey]                 = useState("");
  const [description, setDescription] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Field placer state
  const [placerTemplate, setPlacerTemplate] = useState<Template | null>(null);
  const [placerPdfUrl, setPlacerPdfUrl]     = useState<string | null>(null);
  const [placerLoading, setPlacerLoading]   = useState<string | null>(null); // template id being loaded

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!fileRef.current?.files?.[0]) return;
    setUploading(true);
    setUploadError(null);

    const fd = new FormData();
    fd.append("name", name);
    fd.append("template_key", key);
    fd.append("description", description);
    fd.append("created_by", "staff");
    fd.append("file", fileRef.current.files[0]);

    try {
      await templatesApi.upload(fd);
      setShowForm(false);
      setName(""); setKey(""); setDescription("");
      reload();
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("Remove this template?")) return;
    await templatesApi.deactivate(id);
    reload();
  };

  const handleOpenPlacer = async (t: Template) => {
    setPlacerLoading(t.id);
    try {
      const { url } = await templatesApi.getPdfUrl(t.id);
      setPlacerPdfUrl(url);
      setPlacerTemplate(t);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Could not load PDF");
    } finally {
      setPlacerLoading(null);
    }
  };

  const handleSaveFields = async (fields: TemplateField[]) => {
    if (!placerTemplate) return;
    await templatesApi.saveFields(placerTemplate.id, fields);
    setPlacerTemplate(null);
    setPlacerPdfUrl(null);
    reload();
  };

  // Full-screen field placer
  if (placerTemplate && placerPdfUrl) {
    return (
      <FieldPlacer
        templateName={placerTemplate.name}
        pdfUrl={placerPdfUrl}
        existingFields={placerTemplate.fields_json ?? []}
        onSave={handleSaveFields}
        onClose={() => { setPlacerTemplate(null); setPlacerPdfUrl(null); }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
          <p className="mt-1 text-sm text-gray-500">Set up each agreement once: upload the PDF, add the fields, then reuse it for every contract.</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Upload Template"}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleUpload} className="mb-8 rounded-lg border border-blue-100 bg-blue-50 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">New Template</h2>

          <Field label="Template Name">
            <input className={input} value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Standard Tenancy Agreement" required />
          </Field>

          <Field label="Template Key" hint="Lowercase, underscores only. Used internally.">
            <input className={`${input} font-mono`} value={key}
              onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              placeholder="e.g. tenancy_standard" required />
          </Field>

          <Field label="Description (optional)">
            <input className={input} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="e.g. NSW room licence — 6 month fixed term" />
          </Field>

          <Field label="PDF File">
            <input ref={fileRef} type="file" accept=".pdf" required className="text-sm text-gray-700" />
          </Field>

          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

          <Button type="submit" loading={uploading} className="w-full">
            Upload Template
          </Button>
        </form>
      )}

      {loading && <p className="text-gray-400">Loading...</p>}
      {error   && <p className="text-red-600">{error}</p>}

      <div className="space-y-3">
        {templates.map((t) => (
          <div key={t.id} className="flex items-start justify-between rounded-lg border border-gray-200 bg-white p-4">
            <div>
              <p className="font-medium text-gray-900">{t.name}</p>
              <p className="text-xs font-mono text-gray-400">{t.template_key}</p>
              {t.description && <p className="mt-1 text-sm text-gray-500">{t.description}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge template={t} />
              <button
                onClick={() => handleOpenPlacer(t)}
                disabled={placerLoading === t.id}
                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
              >
                {placerLoading === t.id
                  ? "Loading…"
                  : (t.fields_json?.length ?? 0) > 0
                  ? "Edit fields"
                  : "Set up fields"}
              </button>
              <button
                onClick={() => handleDeactivate(t.id)}
                className="text-xs text-gray-400 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {!loading && templates.length === 0 && (
          <p className="py-16 text-center text-gray-400">No templates yet. Upload your first one above.</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ template }: { template: Template }) {
  const fieldCount = template.fields_json?.length ?? 0;
  if (!template.documenso_template_id) {
    return (
      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
        Upload failed
      </span>
    );
  }
  if (fieldCount === 0) {
    return (
      <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
        Needs fields
      </span>
    );
  }
  return (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
      Ready · {fieldCount} field{fieldCount !== 1 ? "s" : ""}
    </span>
  );
}

const input = "rounded-md border border-gray-300 px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
