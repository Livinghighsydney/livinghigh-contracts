from tortoise import fields
from tortoise.models import Model


class AppSetting(Model):
    """Workspace settings editable in the app (e.g. email sender name, reply-to). Never secrets."""
    key = fields.CharField(max_length=64, pk=True)
    value = fields.TextField(default="")
    updated_by = fields.CharField(max_length=255, null=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "app_settings"
