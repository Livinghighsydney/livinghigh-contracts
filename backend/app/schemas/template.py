from uuid import UUID
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class TemplateSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    template_key: str
    description: str
    documenso_template_id: str | None
    pdf_storage_key: str | None
    fields_json: list
    recipient_map: dict
    is_active: bool
    created_by: str
    created_at: datetime


# Contract details that a "data box" can show. Filled in automatically when a contract is sent.
DataKey = Literal[
    "tenant_name", "tenant_email", "property_address", "room_number",
    "weekly_rent", "bond_amount", "start_date", "end_date",
]


class TemplateFieldIn(BaseModel):
    id: str
    type: Literal["SIGNATURE", "INITIALS", "DATE", "NAME", "EMAIL", "TEXT"]
    page: int = Field(ge=1)
    positionX: float = Field(ge=0, le=100)
    positionY: float = Field(ge=0, le=100)
    width: float = Field(gt=0, le=100)
    height: float = Field(gt=0, le=100)
    recipient: Literal["tenant"] = "tenant"
    # Set only for data boxes (type TEXT). The box becomes read-only and is pre-filled.
    dataKey: DataKey | None = None
    label: str | None = Field(default=None, max_length=100)


class FieldSaveRequest(BaseModel):
    fields: list[TemplateFieldIn]
