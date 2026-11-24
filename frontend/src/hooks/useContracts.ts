import { useState, useEffect } from "react";
import { contractsApi } from "../api/contracts";
import type { ContractSummary } from "../types";

export function useContracts() {
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    contractsApi.list()
      .then(setContracts)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { contracts, loading, error };
}
