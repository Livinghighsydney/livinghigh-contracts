from decimal import Decimal
from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class CreateContractRequest(BaseModel):
    template_key: str
    tenant_name: str
    tenant_email: EmailStr
    property_address: str
    room_number: str | None = None
    weekly_rent: Decimal
    bond_amount: Decimal
    start_date: date
    end_date: date | None = None
    created_by: str

    @field_validator("weekly_rent", "bond_amount")
    @classmethod
    def must_be_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("must be positive")
        return v


class ContractSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_name: str
    tenant_email: str
    property_address: str
    room_number: str | None
    status: str
    created_at: datetime


class ContractDetail(ContractSummary):
    template_key: str
    template_version: str
    weekly_rent: Decimal
    bond_amount: Decimal
    start_date: date
    end_date: date | None
    documenso_envelope_id: str | None
    created_by: str
    updated_at: datetime
