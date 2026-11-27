import { describe, expect, it } from "vitest";
import { contractForm, defaultAnswers, detailLabels } from "@/components/workspace/field-settings";
import { validateDetails } from "@/lib/contracts";
import type { TemplateField } from "@/api/types";

const box = (f: Partial<TemplateField> & Pick<TemplateField, "id" | "type">): TemplateField => ({
  page: 1,
  positionX: 10,
  positionY: 10,
  width: 10,
  height: 3,
  label: f.id,
  recipient: "tenant",
  ...f,
} as TemplateField);

// Shaped like the Info Sys template: details + staff fields on page 1, tenant fields on page 7.
const infoSys: TemplateField[] = [
  box({ id: "address", type: "TEXT", dataKey: "property_address", label: "Address", page: 7, positionY: 35 }),
  box({ id: "signature", type: "SIGNATURE", page: 7, positionY: 58 }),
  box({ id: "utilities", type: "TEXT", staffFill: true, label: "Utilities contribution", positionY: 64 }),
  box({ id: "occupancy_fee", type: "TEXT", dataKey: "weekly_rent", label: "Occupancy fee", positionY: 44 }),
  box({ id: "security_deposit", type: "TEXT", dataKey: "bond_amount", label: "Security deposit", positionY: 47 }),
  box({ id: "move_in", type: "TEXT", dataKey: "start_date", label: "Move in date", positionY: 53 }),
  box({ id: "notice", type: "DROPDOWN", staffFill: true, label: "Notice", positionY: 59, ...({ options: ["2 Weeks", "3 Weeks"], defaultOption: "3 Weeks" } as object) }),
  box({ id: "citizen", type: "RADIO", label: "Citizen?", page: 7, positionY: 41 }), // tenant field — not asked
  box({ id: "name_box", type: "NAME", dataKey: "tenant_name", label: "Tenant name", page: 7, positionY: 55 }),
];

describe("New Contract form mirrors the template", () => {
  it("asks only for the template's staff fields, in document order, with its labels", () => {
    const labels = contractForm(infoSys).map((i) =>
      i.kind === "detail" ? i.label : i.kind === "staff" ? i.field.label : i.group.question,
    );
    expect(labels).toEqual([
      "Occupancy fee",
      "Security deposit",
      "Move in date",
      "Notice",
      "Utilities contribution",
      "Address",
    ]);
  });

  it("never lists tenant fields or details the template doesn't print", () => {
    const keys = contractForm(infoSys).flatMap((i) => (i.kind === "detail" ? [i.key] : []));
    expect(keys).not.toContain("room_number");
    expect(keys).not.toContain("end_date");
    expect(keys).not.toContain("tenant_name"); // always asked separately
  });

  it("asks once when the same detail is printed twice", () => {
    const twice = [...infoSys, box({ id: "fee2", type: "TEXT", dataKey: "weekly_rent", label: "Fee again", page: 2 })];
    expect(contractForm(twice).filter((i) => i.kind === "detail" && i.key === "weekly_rent")).toHaveLength(1);
  });

  it("starts with the template's pre-selected options", () => {
    expect(defaultAnswers(infoSys)).toEqual({ notice: "3 Weeks" });
  });

  it("uses the template's labels in error messages", () => {
    const errors = validateDetails(
      { tenant_name: "A", tenant_email: "a@example.com", property_address: "x", weekly_rent: 0, bond_amount: 1, start_date: "2026-12-01", end_date: "" },
      new Set(["weekly_rent", "bond_amount"]),
      detailLabels(infoSys),
    );
    expect(errors["weekly_rent"]).toBe("“Occupancy fee” must be above $0.");
  });
});
