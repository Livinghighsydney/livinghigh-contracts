import uuid
from tortoise import fields
from tortoise.models import Model


class Recipient(Model):
    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    contract = fields.ForeignKeyField(
        "models.Contract", related_name="recipients", on_delete=fields.CASCADE
    )
    name = fields.CharField(max_length=255)
    email = fields.CharField(max_length=255)
    role = fields.CharField(max_length=50)  # tenant | landlord_rep | witness
    signed_at = fields.DatetimeField(null=True)
    documenso_recipient_id = fields.IntField(null=True)
    signing_url = fields.CharField(max_length=1000, null=True)  # personal link we email to the signer

    class Meta:
        table = "recipients"
