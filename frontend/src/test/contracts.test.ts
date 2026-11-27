import { describe, expect, it, vi } from "vitest";
import {
  validateDetails,
  statusLabel,
  metrics,
  hasSignature,
  clampField,
  templateKey,
  money,
  date,
} from "@/lib/contracts";
import { contractApi } from "@/api/contracts";
import { templateApi } from "@/api/templates";
import type { Contract, TemplateField } from "@/api/types";

const details = {
  tenant_name: "Taylor Smith",
  tenant_email: "taylor@example.com",
  property_address: "42 Crown Street, Sydney",
  weekly_rent: 1350,
  bond_amount: 5400,
  start_date: "2026-12-01",
  end_date: "2027-12-01",
};
const signature: TemplateField = {
  id: "test",
  type: "SIGNATURE",
  label: "Signature",
  page: 1,
  positionX: 10,
  positionY: 10,
  width: 30,
  height: 7,
};

describe("Agreement rules", () => {
  it("accepts complete valid tenant details", () => expect(validateDetails(details)).toEqual({}));
  it("requires a valid email address", () =>
    expect(
      validateDetails({ ...details, tenant_email: "not-an-email" })["tenant_email"],
    ).toBeTruthy());
  it("requires weekly rent above $0", () =>
    expect(validateDetails({ ...details, weekly_rent: 0 })["weekly_rent"]).toBeTruthy());
  it("requires bond above $0", () =>
    expect(validateDetails({ ...details, bond_amount: -1 })["bond_amount"]).toBeTruthy());
  it("requires end date after start date", () =>
    expect(validateDetails({ ...details, end_date: "2026-12-01" })["end_date"]).toBeTruthy());
  it("allows no end date", () => expect(validateDetails({ ...details, end_date: "" })).toEqual({}));
  it("displays archived as Completed", () => expect(statusLabel("archived")).toBe("Completed"));
  it("formats Australian dollars with cents", () => expect(money(1350)).toBe("$1,350.00"));
  it("formats Australian dates", () => expect(date("2026-11-26")).toBe("26/11/2026"));
  it("requires at least one tenant signature", () => {
    expect(hasSignature([])).toBe(false);
    expect(hasSignature([{ ...signature, type: "TEXT" }])).toBe(false);
    expect(hasSignature([signature])).toBe(true);
  });
  it("keeps percentage fields inside the page", () => {
    const f = clampField({ ...signature, positionX: 99, positionY: -8, width: 30, height: 7 });
    expect(f.positionX).toBe(70);
    expect(f.positionY).toBe(0);
    expect(f.width).toBe(30);
  });
  it("formats template keys as lowercase_with_underscores", () =>
    expect(templateKey("Co-Living Room Agreement")).toBe("co_living_room_agreement"));
  it("computes close rate as completed divided by sent", () => {
    const records = [
      { ...details, id: "one", status: "completed" },
      { ...details, id: "two", status: "sent" },
    ] as Contract[];
    expect(
      metrics(records, () => [{ type: "sent", created_at: "2026-11-26T00:00:00Z" }]).closeRate,
    ).toBe(50);
  });
  it("handles a zero-sent close rate", () => expect(metrics([], () => []).closeRate).toBe(0));
  // Status rules are enforced by the backend; the app must show its message to staff.
  it("shows the backend's reason when sending is refused", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Only draft contracts can be sent" }), { status: 400 }),
    );
    await expect(contractApi.action("any-id", "send")).rejects.toThrow("Only draft contracts can be sent");
    fetchMock.mockRestore();
  });
  it("shows the backend's reason when cancelling is refused", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Only a sent or viewed contract can be cancelled." }), {
        status: 400,
      }),
    );
    await expect(contractApi.action("any-id", "cancel")).rejects.toThrow(
      "Only a sent or viewed contract can be cancelled.",
    );
    fetchMock.mockRestore();
  });
  it("refuses saving fields without a signature", async () => {
    await expect(templateApi.saveFields("t1", [])).rejects.toThrow("Add a tenant signature");
  });
});
