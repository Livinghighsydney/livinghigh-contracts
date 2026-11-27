"""Live updates for the staff app over WebSocket.

Whenever something happens to a contract (webhook from Documenso, sent, queued, cancelled,
signed copy archived…) we tell every connected browser that may see that contract, and the
browser refreshes its list. No polling.
"""
import asyncio
import json
import logging
from dataclasses import dataclass

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass(eq=False)
class _Client:
    ws: WebSocket
    user_id: str
    sees_all: bool  # Admins/Managers see every contract; Members only their own


_clients: set[_Client] = set()


def connect(ws: WebSocket, user_id: str, sees_all: bool) -> _Client:
    client = _Client(ws, user_id, sees_all)
    _clients.add(client)
    return client


def disconnect(client: _Client) -> None:
    _clients.discard(client)


async def _send(client: _Client, message: str) -> None:
    try:
        await client.ws.send_text(message)
    except Exception:
        disconnect(client)


def contract_changed(contract_id: str, owner_id: str | None, status: str) -> None:
    """Notify browsers that a contract changed. Never includes personal data — just id + status."""
    if not _clients:
        return
    message = json.dumps({"type": "contract.updated", "id": contract_id, "status": status})
    for client in list(_clients):
        if client.sees_all or (owner_id and client.user_id == owner_id):
            asyncio.create_task(_send(client, message))


def templates_changed() -> None:
    """A template was uploaded, edited or removed — every signed-in browser reloads its template list."""
    message = json.dumps({"type": "templates.updated"})
    for client in list(_clients):
        asyncio.create_task(_send(client, message))
