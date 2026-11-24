import { Badge } from "./ui/Badge";
import type { ContractStatus } from "../types";

const COLOR: Record<ContractStatus, "gray" | "blue" | "green" | "yellow" | "red"> = {
  draft:     "gray",
  sent:      "blue",
  viewed:    "yellow",
  completed: "green",
  archived:  "green",
  rejected:  "red",
  cancelled: "red",
};

const LABEL: Record<ContractStatus, string> = {
  draft:     "Draft",
  sent:      "Sent",
  viewed:    "Viewed",
  completed: "Completed",
  archived:  "Archived",
  rejected:  "Rejected",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: ContractStatus }) {
  return <Badge color={COLOR[status]}>{LABEL[status]}</Badge>;
}
