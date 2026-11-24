import { Link } from "react-router-dom";
import { StatusBadge } from "./StatusBadge";
import type { ContractSummary } from "../types";

export function ContractCard({ contract: c }: { contract: ContractSummary }) {
  return (
    <Link
      to={`/contracts/${c.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900">{c.tenant_name}</p>
          <p className="text-sm text-gray-500">{c.tenant_email}</p>
          <p className="mt-1 text-sm text-gray-600">
            {c.property_address}
            {c.room_number ? ` · Room ${c.room_number}` : ""}
          </p>
        </div>
        <StatusBadge status={c.status} />
      </div>
      <p className="mt-2 text-xs text-gray-400">
        {new Date(c.created_at).toLocaleDateString("en-AU")}
      </p>
    </Link>
  );
}
