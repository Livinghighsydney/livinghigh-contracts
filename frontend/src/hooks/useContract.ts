import { useState, useEffect } from "react";
import { contractsApi } from "../api/contracts";
import type { ContractDetail } from "../types";

export function useContract(id: string) {
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    contractsApi.get(id)
      .then(setContract)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  return { contract, loading, error };
}
