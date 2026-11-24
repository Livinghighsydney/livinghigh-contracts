import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { contractsApi } from "../api/contracts";
import { ContractForm } from "../components/ContractForm";
import type { CreateContractPayload } from "../types";

export function NewContract() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleSubmit = async (data: CreateContractPayload) => {
    setLoading(true);
    setError(null);
    try {
      const res = await contractsApi.create({
        ...data,
        template_key: "tenancy_standard",
        created_by: "staff", // TODO: replace with authenticated user
      });
      navigate(`/contracts/${res.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Contract</h1>
      {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <ContractForm onSubmit={handleSubmit} loading={loading} />
    </div>
  );
}
