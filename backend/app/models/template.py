import uuid
from tortoise import fields
from tortoise.models import Model


class Template(Model):
    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    name = fields.CharField(max_length=255)
    template_key = fields.CharField(max_length=100, unique=True)
    description = fields.TextField(default="")
    documenso_template_id = fields.CharField(max_length=255, null=True)
    pdf_storage_key = fields.CharField(max_length=500, null=True)
    fields_json = fields.JSONField(default=list)
    recipient_map = fields.JSONField(default=dict)
    is_active = fields.BooleanField(default=True)
    created_by = fields.CharField(max_length=255)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "templates"
        ordering = ["-created_at"]
