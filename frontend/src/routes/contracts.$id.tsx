import { createFileRoute } from "@tanstack/react-router";
import { ContractDetail } from "@/components/workspace/contract-detail";
import { metadata } from "@/components/workspace/common";
export const Route = createFileRoute("/contracts/$id")({
  head: () =>
    metadata(
      "Contract details",
      "Review a Living High agreement, its tenant details, documents and activity timeline.",
    ),
  component: ContractPage,
});
function ContractPage() {
  const { id } = Route.useParams();
  return <ContractDetail id={id} />;
}
