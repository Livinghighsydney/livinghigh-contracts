from decimal import Decimal
from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class CreateContractRequest(BaseModel):
    template_key: str
    tenant_name: str
    tenant_email: EmailStr
    # Only the details the template prints are required (checked in contract_service).
    property_address: str = ""
    room_number: str | None = None
    weekly_rent: Decimal | None = None
    bond_amount: Decimal | None = None
    start_date: date | None = None
    end_date: date | None = None
    created_by: str | None = None  # ignored — set from the signed-in user
    # Answers to the template's staff fields: {field id: "text" | number | ["checked", ...]}
    custom_values: dict[str, str | float | int | list[str] | None] = {}

    @field_validator("weekly_rent", "bond_amount")
    @classmethod
    def must_be_positive(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v <= 0:
            raise ValueError("must be positive")
        return v


class SendContractRequest(BaseModel):
    """Optional email text, like PandaDoc's send dialog. Empty = Documenso's default email."""
    email_subject: str | None = Field(default=None, max_length=255)
    email_message: str | None = Field(default=None, max_length=2000)


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
    weekly_rent: Decimal | None
    bond_amount: Decimal | None
    start_date: date | None
    end_date: date | None
    documenso_envelope_id: str | None
    created_by: str
    updated_at: datetime
