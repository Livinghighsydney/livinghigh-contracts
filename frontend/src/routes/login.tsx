import { createFileRoute } from "@tanstack/react-router";
import { LoginForm } from "@/components/workspace/login-form";
import { metadata } from "@/components/workspace/common";
export const Route = createFileRoute("/login")({
  head: () => metadata("Staff sign in", "Sign in to the Living High staff agreement workspace."),
  component: LoginForm,
});
