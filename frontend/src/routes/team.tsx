import { createFileRoute } from "@tanstack/react-router";
import { Team } from "@/components/workspace/team";
import { metadata } from "@/components/workspace/common";
export const Route = createFileRoute("/team")({
  head: () => metadata("Team", "Invite colleagues and manage roles in the Living High workspace."),
  component: Team,
});
