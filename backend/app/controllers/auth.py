from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from app.deps import COOKIE, clear_session_cookie, current_user, set_session_cookie
from app.models.user import User
from app.services import auth_service
from app.services.auth_service import ROLE_LABEL

router = APIRouter()


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class ChangePasswordBody(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


class AcceptInviteBody(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=200)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    try:
        user, token = await auth_service.login(body.email, body.password, _client_ip(request))
    except auth_service.AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    set_session_cookie(response, token)
    return auth_service.user_dict(user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    await auth_service.logout(request.cookies.get(COOKIE))
    clear_session_cookie(response)
    return {"signed_out": True}


@router.get("/me")
async def me(user: User = Depends(current_user)):
    return auth_service.user_dict(user)


@router.post("/change-password")
async def change_password(body: ChangePasswordBody, request: Request, user: User = Depends(current_user)):
    try:
        await auth_service.change_password(user, body.current_password, body.new_password, request.cookies.get(COOKIE))
    except auth_service.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"changed": True}


@router.get("/invite/{token}")
async def get_invite(token: str):
    """Public: shows who invited you before you set a password."""
    try:
        inv = await auth_service.invite_from_token(token)
    except auth_service.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "email": inv.email,
        "role": inv.role.value,
        "role_label": ROLE_LABEL[inv.role],
        "invited_by": inv.invited_by.name,
        "expires_at": inv.expires_at,
    }


@router.post("/invite/{token}/accept")
async def accept_invite(token: str, body: AcceptInviteBody, response: Response):
    try:
        user, session_token = await auth_service.accept_invite(token, body.name, body.password)
    except auth_service.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    set_session_cookie(response, session_token)
    return auth_service.user_dict(user)
