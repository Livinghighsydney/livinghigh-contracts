import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, metadata } from "@/components/workspace/common";
import { settingsApi } from "@/api/settings";
import { templateApi } from "@/api/templates";
import { useResourceVersion } from "@/api/store";
import { Mail, LockKeyhole, UserRound, LoaderCircle, Pencil, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authApi, ROLE_LABEL } from "@/api/auth";
import { toast } from "sonner";
export const Route = createFileRoute("/settings")({
  head: () =>
    metadata("Settings", "Living High email sender details and active agreement templates."),
  component: Settings,
});
function Settings() {
  useResourceVersion();
  const settings = settingsApi.get();
  return (
    <main className="page">
      <PageHeader
        title="Settings"
        eyebrow="Workspace preferences"
        subtitle="Your team’s email and agreement settings."
      />
      <AccountSettings />
      <div className="settings-list">
        <h2 className="section-title flex items-center gap-2 pb-3">
          <Mail size={17} />
          Sender details
        </h2>
        <EmailSettings />
        {[
          {
            title: "Sender email",
            description: "Agreement emails are sent from this address (must be on livinghigh.com.au).",
            value: settings.sender_email,
          },
          {
            title: "Active templates",
            description: "Templates with signing fields, ready to send.",
            value: `${templateApi.list().filter((t) => t.status === "ready").length} ready templates`,
          },
        ].map((item) => (
          <div className="settings-row" key={item.title}>
            <div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
            <div className="text-sm font-medium break-all">{item.value}</div>
          </div>
        ))}
        {!settings.can_edit && (
          <p className="text-[11px] text-muted-foreground mt-6 flex gap-2">
            <LockKeyhole size={13} />
            Only Admins can change the sender details.
          </p>
        )}
      </div>
    </main>
  );
}

/** Sender name + reply-to: locked rows; Admins click Edit, change it, then Save (one request). */
function EmailSettings() {
  useResourceVersion();
  const settings = settingsApi.get();
  const replyShown = settings.reply_to === settings.sender_email ? "" : settings.reply_to;
  return (
    <>
      <LockedSetting
        title="Sender name"
        description="The name tenants see in their inbox, e.g. “Living High”."
        value={settings.sender_name}
        canEdit={settings.can_edit}
        maxLength={100}
        check={(v) => (!v ? "Enter a sender name." : /[<>"]/.test(v) ? "Don’t use < > or quotes." : "")}
        save={(v) => settingsApi.updateEmail({ sender_name: v })}
      />
      <LockedSetting
        title="Reply-to email"
        description={`Tenant replies go here. Leave empty to use the sender email (${settings.sender_email}).`}
        value={replyShown}
        display={settings.reply_to}
        canEdit={settings.can_edit}
        type="email"
        placeholder="e.g. hello@livinghigh.com.au"
        check={(v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "Enter a valid email, or leave it empty." : "")}
        save={(v) => settingsApi.updateEmail({ reply_to: v })}
      />
    </>
  );
}

/** One setting: shown locked with an Edit button; in edit mode an input with Save / Cancel. */
function LockedSetting(props: {
  title: string;
  description: string;
  value: string;
  display?: string;
  canEdit: boolean;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  check: (value: string) => string;
  save: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null); // null = locked
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editing = draft !== null;
  const cancel = () => {
    setDraft(null);
    setError("");
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (draft === null || busy) return;
    const v = draft.trim();
    const problem = props.check(v);
    if (problem) return setError(problem);
    if (v === props.value) return cancel(); // nothing changed — no request
    setBusy(true);
    try {
      await props.save(v);
      cancel();
      toast.success(`${props.title} saved. New emails will use it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Couldn’t save the ${props.title.toLowerCase()}. Try again.`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-row">
      <div>
        <h3>{props.title}</h3>
        <p>{props.description}</p>
      </div>
      {editing ? (
        <form className="flex w-full max-w-sm flex-col gap-2" onSubmit={(e) => void submit(e)}>
          <label className="field">
            <span className="sr-only">{props.title}</span>
            <input
              autoFocus
              type={props.type ?? "text"}
              value={draft}
              placeholder={props.placeholder}
              maxLength={props.maxLength}
              aria-invalid={Boolean(error)}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={(e) => e.key === "Escape" && cancel()}
            />
          </label>
          {error && <p role="alert" className="field-error">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
              Save
            </Button>
            <Button size="sm" type="button" variant="ghost" disabled={busy} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <LockKeyhole size={13} className="text-muted-foreground shrink-0" aria-label="Locked" />
          <span className="text-sm font-medium break-all">{props.display ?? props.value}</span>
          {props.canEdit && (
            <Button size="sm" variant="outline" onClick={() => setDraft(props.value)}>
              <Pencil />
              Edit
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function AccountSettings() {
  useResourceVersion();
  const me = authApi.user();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!me) return null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) return setError("The two new passwords don’t match.");
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      toast.success("Password changed. You’ve been signed out on other devices.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t change your password. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-list mb-10">
      <h2 className="section-title flex items-center gap-2 pb-3">
        <UserRound size={17} />
        Your account
      </h2>
      {[
        { title: "Name", value: me.name },
        { title: "Email", value: me.email },
        { title: "Role", value: `${ROLE_LABEL[me.role]}${me.is_owner ? " · Account owner" : ""}` },
      ].map((item) => (
        <div className="settings-row" key={item.title}>
          <div>
            <h3>{item.title}</h3>
          </div>
          <div className="text-sm font-medium break-all">{item.value}</div>
        </div>
      ))}
      <div className="settings-row">
        <div>
          <h3>Change password</h3>
          <p>At least 8 characters, with a letter and a number.</p>
        </div>
        <form className="flex w-full max-w-xs flex-col gap-3" onSubmit={(e) => void submit(e)}>
          <label className="field">
            Current password
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </label>
          <label className="field">
            New password
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
          </label>
          <label className="field">
            Confirm new password
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
          {error && <p role="alert" className="field-error">{error}</p>}
          <Button disabled={busy} className="self-start">
            {busy && <LoaderCircle className="animate-spin" />}
            Update password
          </Button>
        </form>
      </div>
    </div>
  );
}
