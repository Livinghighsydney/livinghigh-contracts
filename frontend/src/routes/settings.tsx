import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, metadata } from "@/components/workspace/common";
import { settingsApi } from "@/api/settings";
import { templateApi } from "@/api/templates";
import { useResourceVersion } from "@/api/store";
import { Mail, LockKeyhole, UserRound, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authApi, ROLE_LABEL } from "@/api/auth";
import { toast } from "sonner";
export const Route = createFileRoute("/settings")({
  head: () =>
    metadata("Settings", "View Living High email sender details and active agreement templates."),
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
        {[
          {
            title: "Sender name",
            description: "The name tenants see in their inbox.",
            value: settings.sender_name,
          },
          {
            title: "Sender email",
            description: "Agreement emails are sent from this address.",
            value: settings.sender_email,
          },
          {
            title: "Reply-to email",
            description: "Tenant replies go to this address.",
            value: settings.reply_to,
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
        <p className="text-[11px] text-muted-foreground mt-6 flex gap-2">
          <LockKeyhole size={13} />
          These settings are read-only for now.
        </p>
      </div>
    </main>
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
