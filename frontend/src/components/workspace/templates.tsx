import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Upload, FileText, Trash2, PenLine, Plus, LoaderCircle, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Status, Modal, Empty } from "./common";
import { templateApi } from "@/api/templates";
import { useResourceVersion } from "@/api/store";
import { authApi } from "@/api/auth";
import { templateKey, date } from "@/lib/contracts";
import type { Template } from "@/api/types";
import { toast } from "sonner";
export function Templates() {
  useResourceVersion();
  const templates = templateApi.list();
  const canManage = authApi.canManageTemplates();
  const [upload, setUpload] = useState(false);
  const [remove, setRemove] = useState<Template>();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File>();
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setProgress(15);
      if (file.size > 20 * 1024 * 1024) throw new Error("Choose a PDF smaller than 20 MB.");
      const header = await file.slice(0, 5).text();
      if (header !== "%PDF-") throw new Error("This file isn’t a valid PDF. Choose another file.");
      setProgress(60);
      await templateApi.upload(
        { name: name.trim(), template_key: key, description: description.trim() },
        file,
      );
      setProgress(100);
      toast.success("Template uploaded. Add a signature box to make it ready.");
      setUpload(false);
      setName("");
      setKey("");
      setDescription("");
      setFile(undefined);
      setProgress(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
      setProgress(0);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page">
      <PageHeader
        title="Templates"
        eyebrow="Your agreements"
        subtitle={`${templates.filter((t) => t.status === "ready").length} ready to send · ${templates.filter((t) => t.status === "needs fields").length} waiting for setup`}
      >
        {canManage && (
          <Button
            onClick={() => {
              setError("");
              setUpload(true);
            }}
          >
            <Upload />
            Upload template
          </Button>
        )}
      </PageHeader>
      <div className="template-grid">
        {templates.map((t) => (
          <article className="template-card" key={t.id}>
            <div className="flex justify-between items-start">
              <div className="template-document">
                <FileText />
              </div>
              <Status status={t.status} />
            </div>
            <h3>{t.name}</h3>
            <p>{t.description || "No description added."}</p>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-4 mt-auto">
              <span>
                {t.status === "ready" ? `Ready · ${t.field_count} fields` : "Add signing fields"}
              </span>
              <span>{date(t.created_at)}</span>
            </div>
            {canManage && (
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button variant={t.status === "ready" ? "outline" : "default"} size="sm" asChild>
                <Link to="/templates/$id/edit" params={{ id: t.id }}>
                  <PenLine />
                  {t.status === "ready" ? "Edit fields" : "Set up"}
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${t.name}`}
                title="Remove template"
                onClick={() => setRemove(t)}
              >
                <Trash2 size={15} className="text-muted-foreground" />
              </Button>
            </div>
            )}
          </article>
        ))}
      </div>
      {!templates.length && (
        <Empty
          title="No templates yet"
          description={canManage ? "Upload your first agreement to get started." : "Ask an Admin or Manager to set up an agreement template."}
        >
          {canManage && (
            <Button onClick={() => setUpload(true)}>
              <Plus />
              Upload template
            </Button>
          )}
        </Empty>
      )}
      {upload && (
        <Modal
          title="Upload a template"
          description="Choose a PDF agreement to set up for your team."
          onClose={() => {
            if (!busy) setUpload(false);
          }}
        >
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
            <label className="field">
              Template name
              <input
                value={name}
                required
                placeholder="e.g. Residential tenancy agreement"
                onChange={(e) => {
                  setName(e.target.value);
                  setKey(templateKey(e.target.value));
                }}
              />
            </label>
            <label className="field">
              Template key
              <input
                value={key}
                required
                pattern="[a-z0-9_]+"
                onChange={(e) => setKey(templateKey(e.target.value))}
              />
              <small>
                A unique name for this template, using lowercase letters and underscores.
              </small>
            </label>
            <label className="field">
              Description <small>Optional</small>
              <textarea
                value={description}
                rows={2}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="field">
              Agreement PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                required
                onChange={(e) => setFile(e.target.files?.[0])}
              />
              <small>PDF only · Up to 20 MB</small>
            </label>
            {busy && (
              <div>
                <progress value={progress} max={100} className="w-full accent-primary" />
                <p className="text-xs text-muted-foreground">Uploading… {progress}%</p>
              </div>
            )}
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-3 mt-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setUpload(false)}
              >
                Cancel
              </Button>
              <Button disabled={busy || !name.trim() || !key || !file}>
                {busy ? <LoaderCircle className="animate-spin" /> : <Upload />}Upload template
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal
          title="Remove template?"
          description="Existing contracts are kept."
          onClose={() => setRemove(undefined)}
        >
          <p className="text-sm text-muted-foreground">
            Remove “{remove.name}”? Staff won’t be able to use it for new contracts. Existing
            contracts will stay in your workspace.
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setRemove(undefined)}>
              Keep template
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await templateApi.remove(remove.id);
                  setRemove(undefined);
                  toast.success("Template removed.");
                } catch {
                  toast.error("Could not remove the template. Try again.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove template
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}
