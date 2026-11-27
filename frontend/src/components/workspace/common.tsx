import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Contract, ContractStatus } from "@/api/types";
import { date, money, statusLabel } from "@/lib/contracts";
import { templateApi } from "@/api/templates";
export function metadata(title: string, description: string) {
  return {
    meta: [
      { title: `${title} · Living High` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} · Living High` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}
export function Brand() {
  return (
    <span className="brand">
      <img src="/logo-living-high.png" alt="Living High" className="brand-logo" width={1000} height={131} />
    </span>
  );
}
export function Status({ status }: { status: ContractStatus | "ready" | "needs fields" }) {
  return (
    <span className={`status status-${status.replaceAll(" ", "-")}`}>
      {status === "ready"
        ? "Ready"
        : status === "needs fields"
          ? "Needs fields"
          : statusLabel(status)}
    </span>
  );
}
export function PageHeader({
  title,
  eyebrow,
  subtitle,
  children,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <FileText size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  description,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  description?: string;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-[480px] bg-card">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description ?? "Living High workspace"}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Summary({ contract }: { contract: Partial<Contract> }) {
  const values = [
    ["Tenant", contract.tenant_name],
    ["Email address", contract.tenant_email],
    ["Property", contract.property_address],
    ["Room", contract.room_number || "Not specified"],
    ["Weekly rent", contract.weekly_rent ? money(contract.weekly_rent) : "Not set"],
    ["Bond amount", contract.bond_amount ? money(contract.bond_amount) : "Not set"],
    ["Start date", contract.start_date ? date(contract.start_date) : "Not set"],
    ["End date", contract.end_date ? date(contract.end_date) : "Ongoing"],
    ["Template", templateApi.get(contract.template_key ?? "")?.name ?? contract.template_key],
  ];
  return (
    <dl className="detail-summary">
      {values.map(([key, value]) => (
        <div key={key} className={key === "Property" || key === "Template" ? "col-span-2" : ""}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link to="/">← Dashboard</Link>
    </Button>
  );
}
export function UnsavedWarning({ dirty }: { dirty: boolean }) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return null;
}
