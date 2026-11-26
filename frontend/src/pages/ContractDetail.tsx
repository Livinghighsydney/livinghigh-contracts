import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useContract } from "../hooks/useContract";
import { contractsApi } from "../api/contracts";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/Button";

export function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const { contract: c, loading, error } = useContract(id!);
  const [sending, setSending]   = useState(false);
  const [sendErr, setSendErr]   = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleResend = async () => {
    setResending(true);
    setResendMsg(null);
    try {
      const { sent } = await contractsApi.resendEmail(id!);
      setResendMsg({
        ok: true,
        text: sent === "completed_copy" ? "Signed copy emailed to the tenant." : "Signing link emailed to the tenant again.",
      });
    } catch (e: unknown) {
      setResendMsg({ ok: false, text: e instanceof Error ? e.message : "Could not send the email" });
    } finally {
      setResending(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    setSendErr(null);
    try {
      await contractsApi.send(id!);
      window.location.reload();
    } catch (e: unknown) {
      setSendErr(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p className="p-8 text-gray-400">Loading…</p>;
  if (error || !c) return <p className="p-8 text-red-600">{error ?? "Not found"}</p>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/contracts" className="hover:underline">Contracts</Link>
        <span>/</span>
        <span>{c.tenant_name}</span>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{c.tenant_name}</h1>
        <StatusBadge status={c.status} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-3 text-sm">
        <Row label="Email"     value={c.tenant_email} />
        <Row label="Property"  value={c.property_address} />
        {c.room_number && <Row label="Room"      value={c.room_number} />}
        <Row label="Weekly Rent" value={`$${c.weekly_rent}`} />
        <Row label="Bond"      value={`$${c.bond_amount}`} />
        <Row label="Start"     value={c.start_date} />
        {c.end_date && <Row label="End"      value={c.end_date} />}
        <Row label="Template"  value={c.template_key} />
        <Row label="Created By" value={c.created_by} />
      </div>

      {sendErr && <p className="mt-4 text-sm text-red-600">{sendErr}</p>}

      {["sent", "viewed", "completed", "archived"].includes(c.status) && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-gray-600">
              {c.status === "sent" || c.status === "viewed"
                ? "Tenant hasn't signed yet. Email them the signing link again?"
                : "Email the signed copy to the tenant again?"}
            </p>
            <Button variant="secondary" onClick={handleResend} loading={resending} className="shrink-0">
              Resend email
            </Button>
          </div>
          {resendMsg && (
            <p className={`mt-2 text-sm ${resendMsg.ok ? "text-green-700" : "text-red-600"}`}>{resendMsg.text}</p>
          )}
        </div>
      )}

      {c.status === "draft" && (
        <Button onClick={handleSend} loading={sending} className="mt-6 w-full">
          Send for Signing
        </Button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
