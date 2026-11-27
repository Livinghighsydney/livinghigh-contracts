from uuid import UUID
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


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


FieldType = Literal[
    "SIGNATURE", "INITIALS", "DATE", "NAME", "EMAIL", "TEXT",
    "NUMBER", "CHECKBOX", "RADIO", "DROPDOWN",
]
CHOICE_TYPES = {"CHECKBOX", "RADIO", "DROPDOWN"}
STAFF_TYPES = {"TEXT", "NUMBER", "CHECKBOX", "RADIO", "DROPDOWN"}


class TemplateFieldIn(BaseModel):
    id: str
    type: FieldType
    page: int = Field(ge=1)
    positionX: float = Field(ge=0, le=100)
    positionY: float = Field(ge=0, le=100)
    width: float = Field(gt=0, le=100)
    height: float = Field(gt=0, le=100)
    recipient: Literal["tenant"] = "tenant"
    # Set only for data boxes (type TEXT). The box becomes read-only and is pre-filled.
    dataKey: DataKey | None = None
    # Staff answer this field on the New Contract form; the tenant sees it read-only.
    staffFill: bool = False
    # Tick box: a box-only CHECKBOX placed exactly over a box already printed on the PDF.
    tickOnly: bool = False
    group: str | None = Field(default=None, max_length=100)        # staff tick box: the question, e.g. "Furnished"
    optionLabel: str | None = Field(default=None, max_length=100)  # what this box means, e.g. "Yes"
    groupMode: Literal["one", "any"] | None = None                 # pick one (radio) or any (checkboxes)
    showText: bool = False  # tick box: also print its text (label / "This box means") next to the box
    # Staff fields: show the same answer as another staff field (PandaDoc "Copy and link").
    linkTo: str | None = Field(default=None, max_length=64)
    # Staff fields: prefilled, but the tenant may still change the answer when signing.
    tenantEditable: bool = False
    # Staff Text field answered with a date picker (stored + printed as dd/mm/yyyy).
    dateInput: bool = False

    # ---- Field settings (PandaDoc-style "Properties") ----
    label: str | None = Field(default=None, max_length=100)
    placeholder: str | None = Field(default=None, max_length=100)
    required: bool = True
    fontSize: int | None = Field(default=None, ge=8, le=96)
    textAlign: Literal["left", "center", "right"] | None = None
    characterLimit: int | None = Field(default=None, ge=1, le=10000)     # TEXT
    minValue: float | None = None                                        # NUMBER
    maxValue: float | None = None                                        # NUMBER
    options: list[str] | None = Field(default=None, max_length=30)       # CHECKBOX / RADIO / DROPDOWN
    defaultOption: str | None = Field(default=None, max_length=100)      # RADIO / DROPDOWN
    direction: Literal["vertical", "horizontal"] | None = None           # CHECKBOX / RADIO

    @model_validator(mode="after")
    def check_settings(self) -> "TemplateFieldIn":
        if self.dataKey and self.type != "TEXT":
            raise ValueError("Data boxes must be TEXT fields")
        if self.staffFill and (self.dataKey or self.type not in STAFF_TYPES):
            raise ValueError("Staff fields can be Text, Number, Checkbox, Radio buttons or Dropdown")
        if self.type == "SIGNATURE":
            self.required = True  # a contract without a signature makes no sense
        if not self.staffFill or self.tickOnly:
            self.linkTo = None
            self.tenantEditable = False
        if not self.tickOnly:
            self.showText = False
        if not (self.staffFill and self.type == "TEXT"):
            self.dateInput = False
        if self.tickOnly:
            if self.type != "CHECKBOX":
                raise ValueError("Tick boxes must be CHECKBOX fields")
            if self.staffFill:
                self.group = (self.group or "").strip()
                self.optionLabel = (self.optionLabel or "").strip()
                if not self.group or not self.optionLabel:
                    raise ValueError("Each staff tick box needs a question and what the box means (e.g. Furnished → Yes)")
            self.options = None
            self.defaultOption = None
            return self
        if self.type in CHOICE_TYPES:
            opts = [o.strip() for o in (self.options or []) if o.strip()]
            if not opts:
                raise ValueError(f"{self.label or self.type.title()}: add at least one option")
            if any(len(o) > 100 for o in opts):
                raise ValueError("Options must be 100 characters or less")
            if len(set(opts)) != len(opts):
                raise ValueError(f"{self.label or self.type.title()}: options must be different from each other")
            self.options = opts
            if self.defaultOption and self.defaultOption not in opts:
                self.defaultOption = None
        else:
            self.options = None
            self.defaultOption = None
        if self.minValue is not None and self.maxValue is not None and self.minValue > self.maxValue:
            raise ValueError("Minimum value must not be more than the maximum")
        return self


class FieldSaveRequest(BaseModel):
    fields: list[TemplateFieldIn]

    @model_validator(mode="after")
    def check_links(self) -> "FieldSaveRequest":
        by_id = {f.id: f for f in self.fields}
        for f in self.fields:
            if not f.linkTo:
                continue
            target = by_id.get(f.linkTo)
            if not target or not target.staffFill or target.type != f.type or target.linkTo:
                raise ValueError(f"“{f.label or f.type.title()}” is linked to a field that doesn't exist or isn't the same type")
            if f.type in CHOICE_TYPES:
                f.options, f.defaultOption = target.options, target.defaultOption  # linked fields share choices
        return self
