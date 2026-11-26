import hmac
from fastapi import Request, HTTPException


async def verify_documenso_secret(request: Request, expected: str) -> None:
    if not expected:
        # Never accept unauthenticated webhooks (Documenso sends an empty header if no secret is set).
        raise HTTPException(status_code=503, detail="Webhook secret is not configured")
    received = request.headers.get("x-documenso-secret", "")
    try:
        ok = hmac.compare_digest(received.encode(), expected.encode())
    except Exception:
        ok = False
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")
