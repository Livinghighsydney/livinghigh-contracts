import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FilePlus2,
  Files,
  Settings2,
  ChevronDown,
  ChevronRight,
  Menu,
  LogOut,
  HelpCircle,
  X,
  Building2,
  LoaderCircle,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Brand } from "./common";
import { authApi, ROLE_LABEL } from "@/api/auth";
import { useHydrated, useResourceVersion } from "@/api/store";
import { templateApi } from "@/api/templates";
import { contractApi } from "@/api/contracts";
import { liveUpdates } from "@/api/live";
import { LoginForm } from "./login-form";
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const path = useLocation().pathname;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useResourceVersion();
  const hydrated = useHydrated();
  // Live updates over a WebSocket while someone is signed in (no polling).
  const signedIn = hydrated && authApi.isSignedIn();
  useEffect(() => {
    if (!signedIn) return;
    liveUpdates.start();
    return () => liveUpdates.stop();
  }, [signedIn]);
  // Public pages: sign-in and accepting a team invite.
  if (path === "/login" || path.startsWith("/invite/")) return <>{children}</>;
  // Who is signed in is known only in the browser (HttpOnly cookie → /api/auth/me).
  // Server render and first client render both show the loader, so hydration matches.
  const auth = hydrated ? authApi.status() : "unknown";
  if (auth === "unknown") return <FullScreenMessage>Loading your workspace…</FullScreenMessage>;
  if (auth === "error")
    return (
      <FullScreenMessage error action={<Button variant="outline" onClick={() => void authApi.retry()}>Try again</Button>}>
        {authApi.error()}
      </FullScreenMessage>
    );
  if (auth === "signed-out") return <LoginForm />;
  if (path.startsWith("/templates/") && path.endsWith("/edit")) return <>{children}</>;
  const staffName = authApi.staffName();
  const me = authApi.user();
  const nav = [
    { to: "/" as const, label: "Dashboard", icon: LayoutDashboard },
    { to: "/new-contract" as const, label: "New contract", icon: FilePlus2 },
    { to: "/templates" as const, label: "Templates", icon: Files },
    ...(authApi.canManageTeam() ? [{ to: "/team" as const, label: "Team", icon: UsersRound }] : []),
    { to: "/settings" as const, label: "Settings", icon: Settings2 },
  ];
  const current = path.startsWith("/contracts")
    ? "Contract details"
    : (nav.find((n) => n.to === path)?.label ?? "Workspace");
  async function logout() {
    await authApi.signOut();
    void navigate({ to: "/login", replace: true });
  }
  return (
    <div className="workspace">
      {open && (
        <div className="fixed inset-0 bg-foreground/20 z-20" onClick={() => setOpen(false)} />
      )}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link to="/" aria-label="Living High dashboard" onClick={() => setOpen(false)}>
          <Brand />
        </Link>
        <p className="nav-label">Workspace</p>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`nav-link ${path === n.to || (n.to === "/templates" && path.startsWith("/templates")) ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <n.icon />
              {n.label}
              {n.to === "/templates" && (
                <span className="nav-count">{templateApi.list().length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <Building2 size={17} className="mb-2" />
            <span className="font-medium text-foreground">Living High, Sydney</span>
            <br />
            Staff workspace
          </div>
          <div className="user-menu">
            <span className="avatar">{initials(staffName)}</span>
            <div className="flex-1">
              <p className="text-xs font-semibold">{staffName}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {me ? `${ROLE_LABEL[me.role]}${me.is_owner ? " · Owner" : ""}` : ""}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="User menu">
                  <ChevronDown size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{staffName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void navigate({ to: "/settings" })}>
                  <Settings2 />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void logout()}>
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-crumb">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              onClick={() => setOpen(!open)}
              aria-label="Open navigation"
            >
              <Menu />
            </Button>
            <span>Workspace</span>
            <ChevronRight size={12} />
            <span className="text-foreground font-medium">{current}</span>
          </div>
          <div className="topbar-right">
            <span>
              <i className="sample-dot" />
              Live workspace
            </span>
            <span className="topbar-date border-l border-border pl-4">Sydney, Australia</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Workspace information"
              title="About this workspace"
              onClick={() =>
                import("sonner").then(({ toast }) =>
                  toast.info(
                    "Live workspace. Contracts are signed through our e-signing service and tenants receive emails from Living High. Statuses update automatically.",
                  ),
                )
              }
            >
              <HelpCircle size={17} />
            </Button>
          </div>
        </header>
        <DataGate>{children}</DataGate>
      </div>
    </div>
  );
}
function FullScreenMessage({ children, error, action }: { children: ReactNode; error?: boolean; action?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="empty-state">
        {!error && <LoaderCircle className="animate-spin" />}
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}
const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
/** Shows the page once contracts and templates have loaded from the backend. */
export function DataGate({ children }: { children: ReactNode }) {
  useResourceVersion();
  const hydrated = useHydrated();
  contractApi.list();
  templateApi.list();
  const ready = hydrated && contractApi.isLoaded() && templateApi.isLoaded();
  const error = contractApi.loadError() || templateApi.loadError();
  if (ready) return <>{children}</>;
  return (
    <main className="page">
      <div className="empty-state">
        {error ? (
          <>
            <p>{error}</p>
            <Button
              variant="outline"
              onClick={() => {
                void contractApi.refresh();
                void templateApi.refresh();
              }}
            >
              Try again
            </Button>
          </>
        ) : (
          <>
            <LoaderCircle className="animate-spin" />
            Loading your workspace…
          </>
        )}
      </div>
    </main>
  );
}
