"""Request dependencies: who is signed in, and what they may do."""
from fastapi import Depends, HTTPException, Request, Response

from app.config import settings
from app.models.user import User
from app.services import auth_service

COOKIE = "lh_session"


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE, token,
        max_age=settings.session_days * 86400,
        httponly=True,                      # JavaScript can't read it
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,  # type: ignore[arg-type]
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE, path="/", secure=settings.cookie_secure, samesite=settings.cookie_samesite)  # type: ignore[arg-type]


async def current_user(request: Request) -> User:
    user = await auth_service.user_from_token(request.cookies.get(COOKIE))
    if not user:
        raise HTTPException(status_code=401, detail="Please sign in.")
    return user


async def team_manager(user: User = Depends(current_user)) -> User:
    if not auth_service.can_manage_team(user):
        raise HTTPException(status_code=403, detail="Only Admins and Managers can do this.")
    return user


async def template_manager(user: User = Depends(current_user)) -> User:
    if not auth_service.can_manage_templates(user):
        raise HTTPException(status_code=403, detail="Only Admins and Managers can change templates.")
    return user
