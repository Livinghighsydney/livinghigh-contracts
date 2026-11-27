import { createFileRoute } from "@tanstack/react-router";
import { TemplateEditor } from "@/components/workspace/template-editor";
import { metadata } from "@/components/workspace/common";
export const Route = createFileRoute("/templates/$id/edit")({
  head: () =>
    metadata(
      "Template field editor",
      "Place and organise tenant signing fields on Living High agreement templates.",
    ),
  component: EditorPage,
});
function EditorPage() {
  const { id } = Route.useParams();
  return <TemplateEditor id={id} />;
}
