import { useState } from "react";
import {
  UserPlus, MoreHorizontal, Mail, XCircle, ShieldCheck, UserX, UserCheck, ArrowRightLeft, LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader, Modal, Empty } from "./common";
import { authApi, ROLE_LABEL, type Role } from "@/api/auth";
import { teamApi, type TeamMember } from "@/api/team";
import { useResourceVersion } from "@/api/store";
import { date, time } from "@/lib/contracts";
import { toast } from "sonner";

const ROLE_HELP: Record<Role, string> = {
  admin: "Everything: all contracts, templates, team and settings.",
  manager: "Sends and sees all contracts, manages templates, invites people.",
  member: "Creates and sends contracts, and sees only their own.",
};

const initials = (name: string) =>
  name.split(" ").map((p) => p.charAt(0)).join("").slice(0, 2).toUpperCase();

export function Team() {
  useResourceVersion();
  const { members, invites } = teamApi.data();
  const me = authApi.user();
  const isAdmin = authApi.isAdmin();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [deactivate, setDeactivate] = useState<TeamMember>();
  const [transfer, setTransfer] = useState<TeamMember>();
  const [transferTo, setTransferTo] = useState("");

  if (!teamApi.isLoaded())
    return (
      <main className="page">
        <div className="empty-state">
          {teamApi.loadError() ? (
            <>
              <p>{teamApi.loadError()}</p>
              <Button variant="outline" onClick={() => void teamApi.refresh()}>Try again</Button>
            </>
          ) : (
            <>
              <LoaderCircle className="animate-spin" />
              Loading your team…
            </>
          )}
        </div>
      </main>
    );

  const active = members.filter((m) => m.is_active);
  const pending = invites.filter((i) => i.status === "pending" || i.status === "expired");
  // Managers can invite Members and Managers; only Admins can invite Admins (same as PandaDoc).
  const invitableRoles: Role[] = isAdmin ? ["member", "manager", "admin"] : ["member", "manager"];

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong. Try again.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy("invite");
    try {
      await teamApi.invite(email, role);
      toast.success(`Invite sent to ${email.trim()}.`);
      setInviteOpen(false);
      setEmail("");
      setRole("member");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The invite couldn’t be sent. Try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="page">
      <PageHeader
        title="Team"
        eyebrow="Your people"
        subtitle={`${active.length} active member${active.length === 1 ? "" : "s"} · ${pending.length} pending invite${pending.length === 1 ? "" : "s"}`}
      >
        <Button onClick={() => { setError(""); setInviteOpen(true); }}>
          <UserPlus />
          Invite member
        </Button>
      </PageHeader>

      <section className="contracts-section">
        <div className="list-heading">
          <h2 className="section-title">
            Members<span className="total-pill">{members.length}</span>
          </h2>
        </div>
        <div className="table-scroll">
          <table className="contract-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Contracts</th>
                <th>Last signed in</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const self = m.id === me?.id;
                const locked = m.is_owner || self; // can't demote/deactivate the owner or yourself
                return (
                  <tr key={m.id} className="cursor-default">
                    <td>
                      <div className="tenant-cell">
                        <span className={`tenant-avatar tone-${i % 4}`}>{initials(m.name)}</span>
                        <div>
                          <div className="cell-name">
                            {m.name}
                            {self && <span className="text-muted-foreground font-normal"> (you)</span>}
                          </div>
                          <div className="cell-secondary">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {isAdmin && !locked && m.is_active ? (
                        <select
                          aria-label={`Role for ${m.name}`}
                          className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                          value={m.role}
                          disabled={busy === `role-${m.id}`}
                          onChange={(e) => {
                            const next = e.target.value as Role;
                            void run(`role-${m.id}`, () => teamApi.setRole(m.id, next), `${m.name} is now ${ROLE_LABEL[next] === "Admin" ? "an" : "a"} ${ROLE_LABEL[next]}.`);
                          }}
                        >
                          {(["admin", "manager", "member"] as Role[]).map((r) => (
                            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                          {m.role === "admin" && <ShieldCheck size={13} className="text-primary" />}
                          {ROLE_LABEL[m.role]}
                          {m.is_owner && <span className="text-muted-foreground font-normal">· Owner</span>}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`status ${m.is_active ? "status-completed" : "status-cancelled"}`}>
                        {m.is_active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="text-muted-foreground">{m.contract_count}</td>
                    <td>
                      {m.last_login_at ? (
                        <>
                          <div>{date(m.last_login_at)}</div>
                          <div className="cell-secondary">{time(m.last_login_at)}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </td>
                    <td className="text-right">
                      {isAdmin && !locked && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${m.name}`}>
                              <MoreHorizontal size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>{m.name}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {m.contract_count > 0 && (
                              <DropdownMenuItem onClick={() => { setTransferTo(""); setTransfer(m); }}>
                                <ArrowRightLeft />
                                Transfer contracts
                              </DropdownMenuItem>
                            )}
                            {m.is_active ? (
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeactivate(m)}>
                                <UserX />
                                Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => void run(`act-${m.id}`, () => teamApi.setActive(m.id, true), `${m.name} can sign in again.`)}
                              >
                                <UserCheck />
                                Reactivate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="contracts-section mt-8">
        <div className="list-heading">
          <h2 className="section-title">
            Pending invites<span className="total-pill">{pending.length}</span>
          </h2>
        </div>
        {pending.length === 0 ? (
          <Empty title="No pending invites" description="Invite a colleague and they’ll appear here until they accept." />
        ) : (
          <div className="table-scroll">
            <table className="contract-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Invited by</th>
                  <th>Expires</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pending.map((inv) => {
                  const canManage = isAdmin || inv.role !== "admin";
                  return (
                    <tr key={inv.id} className="cursor-default">
                      <td className="cell-name">{inv.email}</td>
                      <td className="text-xs font-medium">{ROLE_LABEL[inv.role]}</td>
                      <td className="text-muted-foreground">{inv.invited_by ?? "—"}</td>
                      <td>
                        {inv.status === "expired" ? (
                          <span className="status status-cancelled">Expired</span>
                        ) : (
                          <>
                            <div>{date(inv.expires_at)}</div>
                            <div className="cell-secondary">{time(inv.expires_at)}</div>
                          </>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={Boolean(busy)}
                              onClick={() => void run(`resend-${inv.id}`, () => teamApi.resendInvite(inv.id), `Invite sent to ${inv.email} again.`)}
                            >
                              {busy === `resend-${inv.id}` ? <LoaderCircle className="animate-spin" /> : <Mail />}
                              Resend
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              disabled={Boolean(busy)}
                              onClick={() => void run(`cancel-${inv.id}`, () => teamApi.cancelInvite(inv.id), "Invite cancelled.")}
                            >
                              <XCircle />
                              Cancel
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="settings-list mt-8">
        <h2 className="section-title pb-3">What each role can do</h2>
        {(["admin", "manager", "member"] as Role[]).map((r) => (
          <div className="settings-row" key={r}>
            <div>
              <h3>{ROLE_LABEL[r]}</h3>
              <p>{ROLE_HELP[r]}</p>
            </div>
          </div>
        ))}
      </section>

      {inviteOpen && (
        <Modal
          title="Invite a team member"
          description="They’ll get an email from Living High with a link to set their password. The link works for 5 days."
          onClose={() => { if (!busy) setInviteOpen(false); }}
        >
          <form onSubmit={(e) => void sendInvite(e)} className="flex flex-col gap-4">
            <label className="field">
              Email address
              <input
                type="email"
                required
                autoFocus
                value={email}
                placeholder="name@livinghigh.com.au"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <fieldset className="field">
              Role
              <div className="mt-1 flex flex-col gap-2">
                {invitableRoles.map((r) => (
                  <label
                    key={r}
                    className={`flex cursor-pointer gap-3 rounded-md border p-3 text-sm ${role === r ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
                    <span>
                      <span className="font-medium">{ROLE_LABEL[r]}</span>
                      <span className="block text-xs text-muted-foreground">{ROLE_HELP[r]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {error && <p role="alert" className="field-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy === "invite"} onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button disabled={busy === "invite"}>
                {busy === "invite" ? <LoaderCircle className="animate-spin" /> : <Mail />}
                Send invite
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deactivate && (
        <Modal
          title={`Deactivate ${deactivate.name}?`}
          description="They’ll be signed out straight away and won’t be able to sign in."
          onClose={() => setDeactivate(undefined)}
        >
          <p className="text-sm text-muted-foreground">
            Their contracts and history are kept. You can reactivate them at any time
            {deactivate.contract_count > 0 ? ", or transfer their contracts to someone else first" : ""}.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeactivate(undefined)}>Keep active</Button>
            <Button
              variant="destructive"
              disabled={Boolean(busy)}
              onClick={async () => {
                const m = deactivate;
                if (await run(`act-${m.id}`, () => teamApi.setActive(m.id, false), `${m.name} has been deactivated.`))
                  setDeactivate(undefined);
              }}
            >
              <UserX />
              Deactivate
            </Button>
          </div>
        </Modal>
      )}

      {transfer && (
        <Modal
          title={`Transfer ${transfer.name}’s contracts`}
          description={`Move all ${transfer.contract_count} contract${transfer.contract_count === 1 ? "" : "s"} to another team member.`}
          onClose={() => setTransfer(undefined)}
        >
          <label className="field">
            New owner
            <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
              <option value="">Choose a team member…</option>
              {active
                .filter((m) => m.id !== transfer.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>{m.name} · {ROLE_LABEL[m.role]}</option>
                ))}
            </select>
          </label>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setTransfer(undefined)}>Cancel</Button>
            <Button
              disabled={!transferTo || Boolean(busy)}
              onClick={async () => {
                const from = transfer;
                const to = active.find((m) => m.id === transferTo);
                if (await run(`transfer-${from.id}`, () => teamApi.transferContracts(from.id, transferTo), `Contracts moved to ${to?.name ?? "the new owner"}.`))
                  setTransfer(undefined);
              }}
            >
              <ArrowRightLeft />
              Transfer
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}
