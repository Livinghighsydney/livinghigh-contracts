from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from app.deps import current_user, team_manager
from app.models.contract import Contract
from app.models.user import Invite, Role, User
from app.services import auth_service, email_service

router = APIRouter()


class InviteBody(BaseModel):
    email: EmailStr
    role: Role = Role.MEMBER


class MemberUpdate(BaseModel):
    role: Role | None = None
    is_active: bool | None = None


class TransferBody(BaseModel):
    to_user_id: str


def _errors(e: ValueError) -> HTTPException:
    code = 403 if isinstance(e, auth_service.PermissionDenied) else 400
    return HTTPException(status_code=code, detail=str(e))


@router.get("/")
async def team(user: User = Depends(team_manager)):
    """Members (with how many contracts they own) and pending invites."""
    members = await User.all().order_by("created_at")
    counts: dict[str, int] = {}
    for c in await Contract.all().values("owner_id"):
        if c["owner_id"]:
            counts[str(c["owner_id"])] = counts.get(str(c["owner_id"]), 0) + 1
    invites = await Invite.filter(accepted_at=None, revoked_at=None).prefetch_related("invited_by")
    return {
        "members": [{**auth_service.user_dict(m), "contract_count": counts.get(str(m.id), 0)} for m in members],
        "invites": [auth_service.invite_dict(i) for i in invites],
    }


@router.post("/invites", status_code=201)
async def invite(body: InviteBody, user: User = Depends(team_manager)):
    try:
        inv = await auth_service.create_invite(user, body.email, body.role)
    except email_service.EmailError as e:
        raise HTTPException(status_code=400, detail=f"The invite couldn't be emailed: {e}")
    except ValueError as e:
        raise _errors(e)
    await inv.fetch_related("invited_by")
    return auth_service.invite_dict(inv)


@router.post("/invites/{invite_id}/resend")
async def resend(invite_id: str, user: User = Depends(team_manager)):
    try:
        inv = await auth_service.resend_invite(user, invite_id)
    except email_service.EmailError as e:
        raise HTTPException(status_code=400, detail=f"The invite couldn't be emailed: {e}")
    except ValueError as e:
        raise _errors(e)
    await inv.fetch_related("invited_by")
    return auth_service.invite_dict(inv)


@router.delete("/invites/{invite_id}", status_code=204)
async def revoke(invite_id: str, user: User = Depends(team_manager)):
    try:
        await auth_service.revoke_invite(user, invite_id)
    except ValueError as e:
        raise _errors(e)


@router.patch("/members/{user_id}")
async def update_member(user_id: str, body: MemberUpdate, user: User = Depends(current_user)):
    try:
        member = await auth_service.update_member(user, user_id, body.role, body.is_active)
    except ValueError as e:
        raise _errors(e)
    return auth_service.user_dict(member)


@router.post("/members/{user_id}/transfer")
async def transfer(user_id: str, body: TransferBody, user: User = Depends(current_user)):
    try:
        moved = await auth_service.transfer_contracts(user, user_id, body.to_user_id)
    except ValueError as e:
        raise _errors(e)
    return {"moved": moved}
