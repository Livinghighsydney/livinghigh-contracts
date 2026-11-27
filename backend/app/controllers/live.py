import secrets
import time

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.config import settings
from app.deps import COOKIE, current_user
from app.models.user import User
from app.services import auth_service, live

router = APIRouter()

# One-time passes for the WebSocket. In production the browser talks to the API through the
# frontend's own domain (so the sign-in cookie works everywhere), but WebSockets can't go through
# that forwarding — so the page asks for a pass over normal HTTP and connects straight to the API.
_TICKET_SECONDS = 60
_tickets: dict[str, tuple[str, float]] = {}  # pass -> (user id, expires at)


@router.post("/live/ticket")
async def live_ticket(user: User = Depends(current_user)):
    now = time.monotonic()
    for t, (_, exp) in list(_tickets.items()):  # forget old passes
        if exp < now:
            _tickets.pop(t, None)
    ticket = secrets.token_urlsafe(32)
    _tickets[ticket] = (str(user.id), now + _TICKET_SECONDS)
    return {"ticket": ticket}


async def _user_from_ticket(ticket: str | None) -> User | None:
    if not ticket:
        return None
    entry = _tickets.pop(ticket, None)  # single use
    if not entry or entry[1] < time.monotonic():
        return None
    return await User.get_or_none(id=entry[0], is_active=True)


@router.websocket("/live")
async def live_updates(ws: WebSocket):
    """Staff browsers connect here to get contract changes the moment they happen."""
    # WebSockets skip CORS, so check the page's origin ourselves.
    allowed = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    if ws.headers.get("origin") not in allowed:
        await ws.close(code=4403)
        return
    user = await _user_from_ticket(ws.query_params.get("ticket")) or await auth_service.user_from_token(ws.cookies.get(COOKIE))
    if not user:
        await ws.close(code=4401)  # not signed in
        return
    await ws.accept()
    client = live.connect(ws, str(user.id), auth_service.sees_all_contracts(user))
    try:
        while True:
            await ws.receive_text()  # we only push; incoming messages just keep the connection alive
    except WebSocketDisconnect:
        pass
    finally:
        live.disconnect(client)
