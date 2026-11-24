from fastapi import APIRouter, Request
from app.config import settings
from app.schemas.webhook import DocumensoWebhookBody
from app.services import contract_service
from app.utils.webhook_verify import verify_documenso_secret

router = APIRouter()


@router.post("/documenso")
async def documenso_webhook(request: Request):
    await verify_documenso_secret(request, settings.documenso_webhook_secret)
    body = DocumensoWebhookBody(**await request.json())
    await contract_service.handle_webhook(body.event, body.payload.model_dump())
    return {"received": True}
