import uuid
from tortoise import fields
from tortoise.models import Model


class Event(Model):
    """Append-only audit log — never update or delete rows."""

    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    contract = fields.ForeignKeyField(
        "models.Contract", related_name="events", on_delete=fields.CASCADE
    )
    type = fields.CharField(max_length=100)
    payload = fields.JSONField()
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "events"
        ordering = ["created_at"]
