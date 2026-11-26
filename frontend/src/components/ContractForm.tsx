import type { ChangeEvent, ReactNode } from "react";
import { Input } from "./ui/Input";
import type { ContractDetailsForm } from "../utils/format";

interface Props {
  value: ContractDetailsForm;
  onChange: (next: ContractDetailsForm) => void;
}

/** Returns a list of problems; empty means the form can continue. */
export function validateDetails(d: ContractDetailsForm): string[] {
  const errors: string[] = [];
  if (!d.tenant_name.trim()) errors.push("Enter the tenant's name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.tenant_email.trim())) errors.push("Enter a valid tenant email");
  if (!d.property_address.trim()) errors.push("Enter the property address");
  if (!(Number(d.weekly_rent) > 0)) errors.push("Weekly rent must be more than $0");
  if (!(Number(d.bond_amount) > 0)) errors.push("Bond must be more than $0");
  if (!d.start_date) errors.push("Choose a start date");
  if (d.end_date && d.start_date && d.end_date <= d.start_date) errors.push("End date must be after the start date");
  return errors;
}

export function ContractForm({ value, onChange }: Props) {
  const set = (key: keyof ContractDetailsForm) => (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: e.target.value });

  return (
    <div className="space-y-6">
      <Section title="Tenant" hint="The signing email goes to this address.">
        <Input label="Full name" value={value.tenant_name} onChange={set("tenant_name")} autoComplete="off" required />
        <Input label="Email" type="email" value={value.tenant_email} onChange={set("tenant_email")} autoComplete="off" required />
      </Section>

      <Section title="Property">
        <Input label="Property address" value={value.property_address} onChange={set("property_address")} required />
        <div className="w-40">
          <Input label="Room number (optional)" value={value.room_number} onChange={set("room_number")} />
        </div>
      </Section>

      <Section title="Rent and dates">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Weekly rent ($)" type="number" min="0" step="0.01" value={value.weekly_rent} onChange={set("weekly_rent")} required />
          <Input label="Bond ($)" type="number" min="0" step="0.01" value={value.bond_amount} onChange={set("bond_amount")} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Start date" type="date" value={value.start_date} onChange={set("start_date")} required />
          <Input label="End date (optional)" type="date" value={value.end_date} onChange={set("end_date")} />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
