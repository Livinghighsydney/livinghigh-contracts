import { createFileRoute } from "@tanstack/react-router";
import { NewContract } from "@/components/workspace/new-contract";
import { metadata } from "@/components/workspace/common";
import { z } from "zod";
export const Route = createFileRoute("/new-contract")({
  validateSearch: z.object({ duplicate: z.string().optional() }),
  head: () =>
    metadata(
      "New contract",
      "Prepare a Living High tenancy agreement and review the tenant and property details.",
    ),
  component: NewContractPage,
});
function NewContractPage() {
  const { duplicate } = Route.useSearch();
  return <NewContract {...(duplicate ? { duplicateId: duplicate } : {})} />;
}
