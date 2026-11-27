from fastapi import APIRouter, Depends
from app.deps import current_user
from app.models.user import User
from app.config import settings
from app.services import email_service

router = APIRouter()


@router.get("/")
async def get_settings(user: User = Depends(current_user)):
    """Read-only workspace settings for the staff app. Never include secrets here."""
    return {
        "sender_name": settings.email_from_name,
        "sender_email": settings.email_from,
        "reply_to": settings.email_reply_to or settings.email_from,
        "email_configured": email_service.is_configured(),
    }
