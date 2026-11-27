import { createFileRoute } from "@tanstack/react-router";
import { AcceptInvite } from "@/components/workspace/accept-invite";
import { metadata } from "@/components/workspace/common";
export const Route = createFileRoute("/invite/$token")({
  head: () => metadata("Join your team", "Accept your invite to the Living High contracts workspace."),
  component: InvitePage,
});
function InvitePage() {
  const { token } = Route.useParams();
  return <AcceptInvite token={token} />;
}
