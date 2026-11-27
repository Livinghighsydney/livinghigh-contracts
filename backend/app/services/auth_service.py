"""Staff login, sessions, invites and team management (PandaDoc-style Admin / Manager / Member)."""
import logging
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.models.contract import Contract
from app.models.user import Invite, Role, Session, User
from app.services import email_service
from app.utils.security import (
    DUMMY_HASH, hash_password, new_token, password_problem, token_hash, verify_password,
)

logger = logging.getLogger(__name__)

ROLE_LABEL = {Role.ADMIN: "Admin", Role.MANAGER: "Manager", Role.MEMBER: "Member"}


class AuthError(ValueError):
    """Safe to show staff."""


class PermissionDenied(ValueError):
    """Safe to show staff."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def norm_email(email: str) -> str:
    return email.strip().lower()


# ---------------- Login rate limit (in-memory; one backend instance) ----------------
_ATTEMPTS: dict[str, list[float]] = defaultdict(list)
_WINDOW, _MAX_ATTEMPTS = 15 * 60, 10


def _check_rate(key: str) -> None:
    now = time.monotonic()
    _ATTEMPTS[key] = [t for t in _ATTEMPTS[key] if now - t < _WINDOW]
    if len(_ATTEMPTS[key]) >= _MAX_ATTEMPTS:
        raise AuthError("Too many sign-in attempts. Please wait 15 minutes and try again.")


def _record_failure(key: str) -> None:
    _ATTEMPTS[key].append(time.monotonic())


# ---------------- Sessions ----------------
async def create_session(user: User) -> str:
    token = new_token()
    await Session.create(user=user, token_hash=token_hash(token), expires_at=_now() + timedelta(days=settings.session_days))
    user.last_login_at = _now()
    await user.save(update_fields=["last_login_at", "updated_at"])
    return token


async def user_from_token(token: str | None) -> User | None:
    if not token:
        return None
    session = await Session.get_or_none(token_hash=token_hash(token)).prefetch_related("user")
    if not session:
        return None
    if session.expires_at <= _now() or not session.user.is_active:
        await session.delete()
        return None
    # Touch at most every 5 minutes to keep DB writes low.
    if _now() - session.last_seen_at > timedelta(minutes=5):
        session.last_seen_at = _now()
        await session.save(update_fields=["last_seen_at"])
    return session.user


async def logout(token: str | None) -> None:
    if token:
        await Session.filter(token_hash=token_hash(token)).delete()


async def login(email: str, password: str, client_ip: str) -> tuple[User, str]:
    email = norm_email(email)
    key = f"{email}|{client_ip}"
    _check_rate(key)
    user = await User.get_or_none(email=email)
    ok = verify_password(password, user.password_hash if user else DUMMY_HASH)
    if not user or not ok:
        _record_failure(key)
        raise AuthError("Email or password is incorrect.")
    if not user.is_active:
        raise AuthError("This account has been deactivated. Ask your admin to reactivate it.")
    _ATTEMPTS.pop(key, None)
    return user, await create_session(user)


async def change_password(user: User, current: str, new: str, keep_token: str | None) -> None:
    if not verify_password(current, user.password_hash):
        raise AuthError("Your current password is incorrect.")
    if problem := password_problem(new):
        raise AuthError(problem)
    if current == new:
        raise AuthError("Choose a new password that's different from the current one.")
    user.password_hash = hash_password(new)
    user.must_change_password = False
    await user.save(update_fields=["password_hash", "must_change_password", "updated_at"])
    # Sign out everywhere else.
    q = Session.filter(user=user)
    if keep_token:
        q = q.exclude(token_hash=token_hash(keep_token))
    await q.delete()


# ---------------- Permissions ----------------
def can_manage_team(user: User) -> bool:
    return user.role in (Role.ADMIN, Role.MANAGER)


def can_manage_templates(user: User) -> bool:
    return user.role in (Role.ADMIN, Role.MANAGER)


def sees_all_contracts(user: User) -> bool:
    return user.role in (Role.ADMIN, Role.MANAGER)


def can_access_contract(user: User, contract: Contract) -> bool:
    return sees_all_contracts(user) or contract.owner_id == user.id


# ---------------- Invites ----------------
def _invite_link(token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/invite/{token}"


def invite_status(inv: Invite) -> str:
    if inv.accepted_at:
        return "accepted"
    if inv.revoked_at:
        return "revoked"
    if inv.expires_at <= _now():
        return "expired"
    return "pending"


async def create_invite(inviter: User, email: str, role: Role) -> Invite:
    if not can_manage_team(inviter):
        raise PermissionDenied("Only Admins and Managers can invite people.")
    if inviter.role == Role.MANAGER and role == Role.ADMIN:
        raise PermissionDenied("Managers can invite Members and Managers. Ask an Admin to invite another Admin.")
    email = norm_email(email)
    existing = await User.get_or_none(email=email)
    if existing:
        raise AuthError(
            "This person is already on the team." if existing.is_active
            else "This person has a deactivated account. Reactivate them from the team list instead."
        )
    # Only one live invite per email.
    await Invite.filter(email=email, accepted_at=None, revoked_at=None).update(revoked_at=_now())

    email_service.ensure_configured()
    token = new_token()
    inv = await Invite.create(
        email=email, role=role, token_hash=token_hash(token), invited_by=inviter,
        expires_at=_now() + timedelta(days=settings.invite_days),
    )
    await _send_invite_email(inv, inviter, token)
    return inv


async def resend_invite(actor: User, invite_id: str) -> Invite:
    if not can_manage_team(actor):
        raise PermissionDenied("Only Admins and Managers can manage invites.")
    inv = await Invite.get_or_none(id=invite_id)
    if not inv or inv.accepted_at or inv.revoked_at:
        raise AuthError("This invite is no longer active.")
    if actor.role == Role.MANAGER and inv.role == Role.ADMIN:
        raise PermissionDenied("Only Admins can resend an Admin invite.")
    token = new_token()
    inv.token_hash = token_hash(token)
    inv.expires_at = _now() + timedelta(days=settings.invite_days)
    await inv.save(update_fields=["token_hash", "expires_at"])
    await _send_invite_email(inv, actor, token)
    return inv


async def revoke_invite(actor: User, invite_id: str) -> None:
    if not can_manage_team(actor):
        raise PermissionDenied("Only Admins and Managers can manage invites.")
    inv = await Invite.get_or_none(id=invite_id)
    if not inv or inv.accepted_at:
        raise AuthError("This invite can't be cancelled.")
    if actor.role == Role.MANAGER and inv.role == Role.ADMIN:
        raise PermissionDenied("Only Admins can cancel an Admin invite.")
    inv.revoked_at = _now()
    await inv.save(update_fields=["revoked_at"])


async def _send_invite_email(inv: Invite, inviter: User, token: str) -> None:
    await email_service.send_team_invite(
        to_email=inv.email,
        inviter_name=inviter.name,
        role_label=ROLE_LABEL[inv.role],
        link=_invite_link(token),
        days=settings.invite_days,
    )


async def invite_from_token(token: str) -> Invite:
    inv = await Invite.get_or_none(token_hash=token_hash(token)).prefetch_related("invited_by")
    if not inv:
        raise AuthError("This invite link isn't valid. Ask your admin to send a new one.")
    status = invite_status(inv)
    if status == "accepted":
        raise AuthError("This invite has already been used. Sign in instead.")
    if status == "revoked":
        raise AuthError("This invite was cancelled. Ask your admin to send a new one.")
    if status == "expired":
        raise AuthError("This invite has expired. Ask your admin to send a new one.")
    return inv


async def accept_invite(token: str, name: str, password: str) -> tuple[User, str]:
    inv = await invite_from_token(token)
    name = name.strip()
    if len(name) < 2:
        raise AuthError("Enter your full name.")
    if problem := password_problem(password):
        raise AuthError(problem)
    if await User.filter(email=inv.email).exists():
        raise AuthError("An account with this email already exists. Sign in instead.")
    user = await User.create(
        email=inv.email, name=name, role=inv.role,
        password_hash=hash_password(password), invited_by_id=inv.invited_by_id,
    )
    inv.accepted_at = _now()
    await inv.save(update_fields=["accepted_at"])
    return user, await create_session(user)


# ---------------- Team ----------------
async def update_member(actor: User, user_id: str, role: Role | None, is_active: bool | None) -> User:
    if actor.role != Role.ADMIN:
        raise PermissionDenied("Only Admins can change roles or deactivate people.")
    target = await User.get_or_none(id=user_id)
    if not target:
        raise AuthError("Team member not found.")
    if target.is_owner and (role not in (None, Role.ADMIN) or is_active is False):
        raise PermissionDenied("The account owner can't be demoted or deactivated.")
    if target.id == actor.id and (role not in (None, Role.ADMIN) or is_active is False):
        raise PermissionDenied("You can't demote or deactivate yourself.")
    fields = []
    if role is not None and role != target.role:
        target.role = role
        fields.append("role")
    if is_active is not None and is_active != target.is_active:
        target.is_active = is_active
        fields.append("is_active")
    if fields:
        await target.save(update_fields=[*fields, "updated_at"])
        if is_active is False:
            await Session.filter(user=target).delete()  # signed out immediately
    return target


async def transfer_contracts(actor: User, from_id: str, to_id: str) -> int:
    """PandaDoc's 'Transfer ownership': move every contract owned by one person to another."""
    if actor.role != Role.ADMIN:
        raise PermissionDenied("Only Admins can transfer contracts.")
    if from_id == to_id:
        raise AuthError("Choose a different person to transfer to.")
    to_user = await User.get_or_none(id=to_id, is_active=True)
    if not to_user or not await User.filter(id=from_id).exists():
        raise AuthError("Team member not found.")
    return await Contract.filter(owner_id=from_id).update(owner_id=to_user.id)


def user_dict(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "name": u.name,
        "role": u.role.value,
        "is_owner": u.is_owner,
        "is_active": u.is_active,
        "must_change_password": u.must_change_password,
        "last_login_at": u.last_login_at,
        "created_at": u.created_at,
    }


def invite_dict(inv: Invite) -> dict:
    return {
        "id": str(inv.id),
        "email": inv.email,
        "role": inv.role.value,
        "status": invite_status(inv),
        "invited_by": getattr(inv.invited_by, "name", None) if hasattr(inv, "invited_by") else None,
        "expires_at": inv.expires_at,
        "created_at": inv.created_at,
    }
