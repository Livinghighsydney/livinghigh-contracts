import uuid
from enum import Enum
from tortoise import fields
from tortoise.models import Model


class ContractStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    VIEWED = "viewed"
    COMPLETED = "completed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    ARCHIVED = "archived"


class Contract(Model):
    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    template_key = fields.CharField(max_length=100)
    template_version = fields.CharField(max_length=50, default="1")
    status = fields.CharEnumField(ContractStatus, default=ContractStatus.DRAFT)
    documenso_envelope_id = fields.CharField(max_length=255, null=True)

    tenant_name = fields.CharField(max_length=255)
    tenant_email = fields.CharField(max_length=255)
    property_address = fields.CharField(max_length=500)
    room_number = fields.CharField(max_length=50, null=True)
    weekly_rent = fields.DecimalField(max_digits=10, decimal_places=2)
    bond_amount = fields.DecimalField(max_digits=10, decimal_places=2)
    start_date = fields.DateField()
    end_date = fields.DateField(null=True)

    created_by = fields.CharField(max_length=255)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "contracts"
        ordering = ["-created_at"]
