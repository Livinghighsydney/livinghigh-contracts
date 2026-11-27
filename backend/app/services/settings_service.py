"""Email settings staff can change on the Settings page.

Saved in the database and kept in memory, so sending an email never waits for a lookup.
.env values (EMAIL_FROM_NAME / EMAIL_REPLY_TO) are the defaults until someone saves a change.
The sender *address* stays in .env: it must be on the domain verified in Resend.
"""
from datetime import datetime, timezone

from app.config import settings
from app.models.setting import AppSetting

_cache: dict[str, str] = {}


async def load() -> None:
    _cache.clear()
    for s in await AppSetting.all():
        _cache[s.key] = s.value


def sender_name() -> str:
    return _cache.get("sender_name") or settings.email_from_name


def reply_to() -> str:
    """Where tenant replies go. Empty = the sender address."""
    return _cache.get("reply_to") or settings.email_reply_to or settings.email_from


async def update(changes: dict[str, str], *, by: str) -> None:
    """Save only values that actually changed — one small write each, nothing if unchanged."""
    for key, value in changes.items():
        if _cache.get(key) == value:
            continue
        updated = await AppSetting.filter(key=key).update(value=value, updated_by=by, updated_at=datetime.now(timezone.utc))
        if not updated:
            await AppSetting.create(key=key, value=value, updated_by=by)
        _cache[key] = value
