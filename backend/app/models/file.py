import uuid
from enum import Enum
from tortoise import fields
from tortoise.models import Model


class FileKind(str, Enum):
    SIGNED_PDF = "signed_pdf"
    CERTIFICATE = "certificate"
    AUDIT_LOG = "audit_log"  # Documenso's full Audit Log PDF (every event, IP, device)


class ContractFile(Model):
    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    contract = fields.ForeignKeyField(
        "models.Contract", related_name="files", on_delete=fields.CASCADE
    )
    kind = fields.CharEnumField(FileKind)
    storage_key = fields.CharField(max_length=500)
    sha256 = fields.CharField(max_length=64)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "files"
