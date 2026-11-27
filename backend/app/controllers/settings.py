from fastapi import APIRouter, Depends, HTTPException
from typing import Literal
from pydantic import BaseModel, EmailStr, Field, field_validator
from app.deps import admin_only, current_user
from app.models.user import Role, User
from app.config import settings
from app.services import email_service, settings_service

router = APIRouter()


def _view(user: User) -> dict:
    """Workspace settings for the staff app. Never include secrets here."""
    return {
        "sender_name": settings_service.sender_name(),
        "sender_email": settings.email_from,
        "reply_to": settings_service.reply_to(),
        "email_configured": email_service.is_configured(),
        "can_edit": user.role == Role.ADMIN,
    }


class EmailSettingsIn(BaseModel):
    """Send only the setting being changed (each row on the Settings page saves on its own)."""
    sender_name: str | None = Field(default=None, min_length=1, max_length=100)
    reply_to: EmailStr | Literal[""] | None = None  # "" = replies go to the sender address

    @field_validator("sender_name")
    @classmethod
    def one_line(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v or any(ord(c) < 32 or c in '<>"' for c in v):  # no line breaks / header tricks
            raise ValueError("Use a plain name on one line (no < > or quotes).")
        return v


@router.get("/")
async def get_settings(user: User = Depends(current_user)):
    return _view(user)


@router.patch("/email")
async def update_email_settings(body: EmailSettingsIn, user: User = Depends(admin_only)):
    changes = {}
    if body.sender_name is not None:
        changes["sender_name"] = body.sender_name
    if body.reply_to is not None:
        changes["reply_to"] = str(body.reply_to).lower()
    await settings_service.update(changes, by=user.email)
    return _view(user)
