import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Send,
  Copy,
  Download,
  XCircle,
  Check,
  Mail,
  Eye,
  FileText,
  PenLine,
  Clock3,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Status, Summary, Empty, Modal, BackLink } from "./common";
import { PdfPreview } from "./pdf-preview";
import { ContractSummary } from "./field-settings";
import { contractApi } from "@/api/contracts";
import { templateApi } from "@/api/templates";
import { useResourceVersion } from "@/api/store";
import { date, time, isComplete, fieldValue } from "@/lib/contracts";
import { toast } from "sonner";
const eventLabels: Record<string, string> = {
  created: "Contract created",
  sent: "Contract sent",
  "email sent": "Signing link emailed",
  opened: "Opened by tenant",
  signed: "Signed by tenant",
  completed: "Contract completed",
  "signed copy emailed": "Signed copy emailed",
  "email failed": "Email could not be delivered",
  cancelled: "Contract cancelled",
  queued: "Queued — Documenso was busy, sending automatically",
  "send failed": "Couldn’t be sent — check the details and send again",
};
export function ContractDetail({ id }: { id: string }) {
  useResourceVersion();
  const c = contractApi.get(id);
  const [busy, setBusy] = useState("");
  const [cancel, setCancel] = useState(false);
  const [preview, setPreview] = useState(false);
  if (!c)
    return (
      <main className="page">
        <BackLink />
        <Empty
          title="Contract not found"
          description="It may have been removed. Go back to your dashboard."
        />
      </main>
    );
  const template = templateApi.get(c.template_key);
  const complete = isComplete(c.status);
  const blanks = template?.fields.filter((f) => f.dataKey && !fieldValue(f, c)) ?? [];
  async function action(a: "send" | "resend" | "cancel") {
    if (!c) return;
    setBusy(a);
    try {
      await contractApi.action(id, a);
      toast.success(
        a === "cancel"
          ? "Contract cancelled. The signing link no longer works."
          : a === "send"
            ? contractApi.get(id)?.status === "queued"
              ? "Documenso is busy. The contract is queued and will be sent automatically in a few minutes."
              : `Contract sent. ${c.tenant_email} will receive the signing link by email.`
            : `${complete ? "Signed copy" : "Signing link"} emailed to ${c.tenant_email} again.`,
      );
      setCancel(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy("");
    }
  }
  async function download(kind: "signed_pdf" | "certificate" | "audit_log") {
    if (!c) return;
    setBusy("download");
    try {
      await contractApi.download(id, kind);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The document couldn’t be downloaded. Try again.");
    } finally {
      setBusy("");
    }
  }
  return (
    <main className="page">
      <div className="mb-4">
        <BackLink />
      </div>
      <PageHeader title={c.tenant_name} eyebrow="Contract details" subtitle={c.property_address}>
        <div className="flex items-center gap-3">
          <Status status={c.status} />
          <Button variant="outline" asChild>
            <Link to="/new-contract" search={{ duplicate: id }}>
              <Copy />
              Duplicate
            </Link>
          </Button>
        </div>
      </PageHeader>
      {c.status === "queued" && (
        <div className="notice mb-6">
          <Clock3 size={17} />
          <span>
            Waiting to send. Documenso only accepts a few new contracts every few minutes, so this one is queued
            and will be sent automatically{c.next_send_at ? ` at about ${time(c.next_send_at)}` : " shortly"}. You
            don’t need to do anything.
          </span>
        </div>
      )}
      <div className="detail-grid">
        <div>
          <section className="detail-block">
            <h2 className="section-title">Agreement details</h2>
            {template ? (
              <ContractSummary fields={template.fields} contract={c} templateName={template.name} />
            ) : (
              <Summary contract={c} />
            )}
            <div className="flex flex-wrap gap-3 mt-7">
              <Button variant="outline" onClick={() => setPreview(!preview)}>
                <FileText />
                {preview ? "Hide agreement" : "View agreement"}
              </Button>
              {c.status === "draft" && (
                <Button
                  disabled={Boolean(busy) || blanks.length > 0}
                  onClick={() => void action("send")}
                >
                  {busy === "send" ? <LoaderCircle className="animate-spin" /> : <Send />}Send to
                  tenant
                </Button>
              )}
              {(c.status === "sent" || c.status === "viewed" || complete) && (
                <Button
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() => void action("resend")}
                >
                  <Mail />
                  {complete ? "Resend signed copy" : "Resend email"}
                </Button>
              )}
              {(c.status === "sent" || c.status === "viewed") && (
                <Button
                  variant="ghost"
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    setBusy("sync");
                    try {
                      const r = await contractApi.sync(id);
                      toast.success(r.changed ? "Status updated from Documenso." : "Already up to date.");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Couldn’t check the status. Try again.");
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {busy === "sync" ? <LoaderCircle className="animate-spin" /> : <Clock3 />}
                  Check status now
                </Button>
              )}
              {(c.status === "sent" || c.status === "viewed" || c.status === "queued") && (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={Boolean(busy)}
                  onClick={() => setCancel(true)}
                >
                  <XCircle />
                  Cancel contract
                </Button>
              )}
            </div>
            {blanks.length > 0 && c.status === "draft" && (
              <p className="field-error mt-3">
                Missing details: {blanks.map((f) => f.label).join(", ")}. Duplicate this draft to
                complete the details.
              </p>
            )}
          </section>
          {complete && (
            <section className="detail-block">
              <div className="notice">
                <Check size={17} />
                This agreement is completed and filed.
              </div>
              <h2 className="section-title mb-4">Documents</h2>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() => void download("signed_pdf")}
                >
                  <Download />
                  Download signed PDF
                </Button>
                <Button
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() => void download("certificate")}
                >
                  <Download />
                  Download certificate
                </Button>
                <Button
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() => void download("audit_log")}
                >
                  <Download />
                  Download audit log
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Stored in Living High’s own archive, with Documenso’s signing certificate and full audit log.
              </p>
            </section>
          )}
          {preview && template && <PdfPreview template={template} contract={c} />}
          <p className="text-[11px] text-muted-foreground">
            Created by {c.created_by} on {date(c.created_at)} at {time(c.created_at)}
          </p>
        </div>
        <section>
          <h2 className="section-title flex items-center gap-2">
            <Clock3 size={17} />
            Activity timeline
          </h2>
          <div className="timeline">
            {contractApi.events(id).map((event, i) => {
              const Icon =
                event.type === "opened"
                  ? Eye
                  : event.type === "signed"
                    ? PenLine
                    : event.type === "created"
                      ? FileText
                      : event.type === "completed"
                        ? Check
                        : Mail;
              return (
                <div className="timeline-item" key={`${event.type}-${i}`}>
                  <span className="timeline-icon">
                    <Icon />
                  </span>
                  <p className="timeline-title">{eventLabels[event.type]}</p>
                  <p className="timeline-time">
                    {date(event.created_at)} · {time(event.created_at)}
                  </p>
                </div>
              );
            })}
            {c.status === "cancelled" && (
              <div className="timeline-item">
                <span className="timeline-icon">
                  <XCircle />
                </span>
                <p className="timeline-title">Contract cancelled</p>
                <p className="timeline-time">
                  {date(c.updated_at)} · {time(c.updated_at)}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
      {cancel && (
        <Modal
          title="Cancel this contract?"
          description="This is recorded in the contract’s history."
          onClose={() => setCancel(false)}
        >
          <p className="text-sm text-muted-foreground">
            The signing link for {c.tenant_name} will stop working straight away. You can duplicate
            the contract later if you need to send it again.
          </p>
          <div className="flex justify-end gap-3 mt-5">
            <Button variant="outline" onClick={() => setCancel(false)}>
              Keep contract
            </Button>
            <Button
              variant="destructive"
              disabled={Boolean(busy)}
              onClick={() => void action("cancel")}
            >
              Cancel contract
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}
