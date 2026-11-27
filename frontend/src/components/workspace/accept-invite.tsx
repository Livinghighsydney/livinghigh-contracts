import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authApi } from "@/api/auth";
import { Brand } from "./common";
import { toast } from "sonner";

type InviteInfo = Awaited<ReturnType<typeof authApi.getInvite>>;

/** Public page from the invite email: set your name and password, then you're signed in. */
export function AcceptInvite({ token }: { token: string }) {
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InviteInfo>();
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    authApi
      .getInvite(token)
      .then(setInvite)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "This invite link isn’t valid."));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("The two passwords don’t match.");
    setBusy(true);
    try {
      await authApi.acceptInvite(token, name.trim(), password);
      toast.success("Welcome to Living High Contracts.");
      void navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t create your account. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-side">
        <Brand />
        <div>
          <p className="text-sm opacity-70 mb-4">LIVING HIGH CONTRACTS</p>
          <h1>
            Tenancy agreements,
            <br />
            signed in minutes.
          </h1>
          <p className="mt-5 max-w-sm text-sm opacity-80">
            Prepare, send and track every agreement in one place, with signed copies filed automatically.
          </p>
        </div>
        <small>Living High · Sydney, Australia</small>
      </div>
      <div className="login-form-wrap">
        {loadError ? (
          <div className="login-form">
            <h2>Invite not available</h2>
            <p className="subtitle mb-8">{loadError}</p>
            <Button className="w-full" size="lg" onClick={() => void navigate({ to: "/login" })}>
              Go to sign in
              <ArrowRight />
            </Button>
          </div>
        ) : !invite ? (
          <div className="login-form">
            <div className="empty-state">
              <LoaderCircle className="animate-spin" />
              Checking your invite…
            </div>
          </div>
        ) : (
          <form className="login-form" onSubmit={(e) => void submit(e)}>
            <h2>Join your team</h2>
            <p className="subtitle mb-8">
              {invite.invited_by} invited you as {invite.role_label === "Admin" ? "an" : "a"}{" "}
              <strong>{invite.role_label}</strong>. Set up your account to get started.
            </p>
            <label className="field mb-5">
              Email address
              <input type="email" value={invite.email} disabled readOnly />
            </label>
            <label className="field mb-5">
              Full name
              <input
                autoComplete="name"
                value={name}
                placeholder="e.g. Olivia Parker"
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </label>
            <label className="field mb-5">
              Password
              <small>At least 8 characters, with a letter and a number</small>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </label>
            <label className="field mb-5">
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </label>
            {error && (
              <p role="alert" className="field-error mb-4">
                {error}
              </p>
            )}
            <Button className="w-full" size="lg" disabled={busy}>
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <>
                  Create account
                  <ArrowRight />
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
