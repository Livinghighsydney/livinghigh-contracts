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
