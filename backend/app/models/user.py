import uuid
from enum import Enum
from tortoise import fields
from tortoise.models import Model


class Role(str, Enum):
    """Same hierarchy as PandaDoc."""
    ADMIN = "admin"      # everything: all contracts, templates, team, settings
    MANAGER = "manager"  # all contracts + templates, can invite Members/Managers
    MEMBER = "member"    # own contracts only


class User(Model):
    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    email = fields.CharField(max_length=255, unique=True)  # always stored lower-case
    name = fields.CharField(max_length=255)
    role = fields.CharEnumField(Role, default=Role.MEMBER)
    password_hash = fields.CharField(max_length=255)
    # The account owner (seeded super admin) can never be demoted or deactivated — no lock-out.
    is_owner = fields.BooleanField(default=False)
    is_active = fields.BooleanField(default=True)
    must_change_password = fields.BooleanField(default=False)
    invited_by = fields.ForeignKeyField(
        "models.User", related_name="invited_users", null=True, on_delete=fields.SET_NULL
    )
    last_login_at = fields.DatetimeField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "users"
        ordering = ["created_at"]


class Invite(Model):
    """A pending invitation. Only a hash of the emailed token is stored."""
    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    email = fields.CharField(max_length=255)
    role = fields.CharEnumField(Role, default=Role.MEMBER)
    token_hash = fields.CharField(max_length=64, unique=True)
    invited_by = fields.ForeignKeyField("models.User", related_name="sent_invites", on_delete=fields.CASCADE)
    expires_at = fields.DatetimeField()
    accepted_at = fields.DatetimeField(null=True)
    revoked_at = fields.DatetimeField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "invites"
        ordering = ["-created_at"]


class Session(Model):
    """Server-side login session. The browser holds a random token in an HttpOnly cookie; we store its hash."""
    id = fields.UUIDField(pk=True, default=uuid.uuid4)
    user = fields.ForeignKeyField("models.User", related_name="sessions", on_delete=fields.CASCADE)
    token_hash = fields.CharField(max_length=64, unique=True)
    expires_at = fields.DatetimeField()
    last_seen_at = fields.DatetimeField(auto_now_add=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "sessions"
