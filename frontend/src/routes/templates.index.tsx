import { createFileRoute } from "@tanstack/react-router";
import { Templates } from "@/components/workspace/templates";
import { metadata } from "@/components/workspace/common";
export const Route = createFileRoute("/templates/")({
  head: () =>
    metadata("Templates", "Manage Living High agreement templates and tenant signing fields."),
  component: Templates,
});
