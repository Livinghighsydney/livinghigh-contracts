import { Link } from "react-router-dom";
import { useContracts } from "../hooks/useContracts";
import { ContractCard } from "../components/ContractCard";
import { Button } from "../components/ui/Button";

export function Dashboard() {
  const { contracts, loading, error } = useContracts();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
        <Link to="/contracts/new">
          <Button>+ New Contract</Button>
        </Link>
      </div>

      {loading && <p className="text-gray-400">Loading…</p>}
      {error   && <p className="text-red-600">{error}</p>}

      <div className="space-y-3">
        {contracts.map((c) => <ContractCard key={c.id} contract={c} />)}
        {!loading && contracts.length === 0 && (
          <p className="py-16 text-center text-gray-400">No contracts yet.</p>
        )}
      </div>
    </div>
  );
}
