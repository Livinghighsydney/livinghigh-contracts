import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/workspace/dashboard";
import { metadata } from "@/components/workspace/common";
export const Route = createFileRoute("/")({
  head: () =>
    metadata("Dashboard", "Living High staff contract activity, agreements and signing progress."),
  component: Dashboard,
});
