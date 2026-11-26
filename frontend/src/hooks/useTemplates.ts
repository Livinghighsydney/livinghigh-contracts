import { useState, useEffect, useCallback } from "react";
import { templatesApi, type Template } from "../api/templates";

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    templatesApi.list()
      .then(setTemplates)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { templates, loading, error, reload: load };
}
