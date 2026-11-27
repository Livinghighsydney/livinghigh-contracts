from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.deps import COOKIE
from app.services import auth_service, live

router = APIRouter()


@router.websocket("/live")
async def live_updates(ws: WebSocket):
    """Staff browsers connect here to get contract changes the moment they happen."""
    # WebSockets skip CORS, so check the page's origin ourselves.
    allowed = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    if ws.headers.get("origin") not in allowed:
        await ws.close(code=4403)
        return
    user = await auth_service.user_from_token(ws.cookies.get(COOKIE))
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
