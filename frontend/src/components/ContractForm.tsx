import { useState, FormEvent, ChangeEvent } from "react";
import { Input } from "./ui/Input";
import { Button } from "./ui/Button";
import type { CreateContractPayload } from "../types";

interface Props {
  onSubmit: (data: CreateContractPayload) => Promise<void>;
  loading?: boolean;
}

type FormState = Partial<Record<keyof CreateContractPayload, string>>;

export function ContractForm({ onSubmit, loading }: Props) {
  const [form, setForm] = useState<FormState>({});

  const set = (key: keyof CreateContractPayload) =>
    (e: ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...(form as CreateContractPayload),
      weekly_rent: Number(form.weekly_rent),
      bond_amount: Number(form.bond_amount),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Tenant Name"     value={form.tenant_name ?? ""}     onChange={set("tenant_name")}     required />
      <Input label="Tenant Email"    value={form.tenant_email ?? ""}    onChange={set("tenant_email")}    type="email" required />
      <Input label="Property Address" value={form.property_address ?? ""} onChange={set("property_address")} required />
      <Input label="Room Number"     value={form.room_number ?? ""}     onChange={set("room_number")} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Weekly Rent ($)" value={form.weekly_rent ?? ""} onChange={set("weekly_rent")} type="number" min="0" step="0.01" required />
        <Input label="Bond Amount ($)" value={form.bond_amount ?? ""} onChange={set("bond_amount")} type="number" min="0" step="0.01" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Start Date" value={form.start_date ?? ""} onChange={set("start_date")} type="date" required />
        <Input label="End Date"   value={form.end_date ?? ""}   onChange={set("end_date")}   type="date" />
      </div>
      <Button type="submit" loading={loading} className="w-full mt-2">
        Create Contract
      </Button>
    </form>
  );
}
