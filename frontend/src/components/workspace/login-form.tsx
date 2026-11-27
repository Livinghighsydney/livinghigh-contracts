import { useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authApi } from "@/api/auth";
import { Brand } from "./common";
import { toast } from "sonner";
export function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Sign-in animation: the white panel sweeps left over the blue one, then the dashboard fades in.
  const panel = useRef<HTMLDivElement>(null);
  const [curtain, setCurtain] = useState<CSSProperties | null>(null);
  const leaving = curtain !== null;

  function playThenOpen(finish: (() => void) & { ready: Promise<void> }) {
    const open = () => {
      finish();
      // From /login go to the dashboard; anywhere else, stay on the page they opened.
      if (window.location.pathname === "/login") void navigate({ to: "/" });
    };
    const box = panel.current?.getBoundingClientRect();
    if (!box || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return open();
    // Start exactly over the white panel, then grow to cover the whole screen.
    setCurtain({ top: box.top, left: box.left, width: box.width, height: box.height });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setCurtain({ top: 0, left: 0, width: "100vw", height: "100vh" })),
    );
    // Open when the sweep has finished AND the dashboard data is in (never wait more than 4 s).
    const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
    void Promise.all([wait(800), Promise.race([finish.ready, wait(4000)])]).then(open);
  }

  return (
    <div className={`login-page ${leaving ? "is-leaving" : ""}`}>
      {curtain && (
        <div className="login-curtain" style={curtain} aria-hidden>
          <div className="login-curtain-brand">
            <Brand />
          </div>
        </div>
      )}
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
      <div className="login-form-wrap" ref={panel}>
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              playThenOpen(await authApi.signIn(email, password, { defer: true }));
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not sign in. Try again.");
              setBusy(false);
            }
          }}
        >
          <h2>Welcome back</h2>
          <p className="subtitle mb-8">Sign in to your staff workspace.</p>
          <label className="field mb-5">
            Email address
            <input
              type="email"
              autoComplete="username"
              value={email}
              placeholder="you@livinghigh.com.au"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field mb-2">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <div className="flex justify-end mb-5">
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() =>
                toast.info("Ask an Admin on your team to reset your access, or contact contracts@livinghigh.com.au.")
              }
            >
              Forgot password?
            </Button>
          </div>
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
                Sign in
                <ArrowRight />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
