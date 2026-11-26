from fastapi import APIRouter, BackgroundTasks, Request
from app.config import settings
from app.schemas.webhook import DocumensoWebhookBody
from app.services import contract_service
from app.utils.webhook_verify import verify_documenso_secret

router = APIRouter()


@router.post("/documenso")
async def documenso_webhook(request: Request, background: BackgroundTasks):
    await verify_documenso_secret(request, settings.documenso_webhook_secret)
    body = DocumensoWebhookBody(**await request.json())
    to_archive = await contract_service.handle_webhook(body.event, body.payload.model_dump())
    if to_archive:
        # Downloading files + emailing takes a few seconds; reply to Documenso straight away.
        background.add_task(contract_service.archive_and_notify, to_archive)
    return {"received": True}
