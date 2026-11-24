from pydantic import BaseModel


class WebhookPayload(BaseModel):
    model_config = {"extra": "allow"}

    envelopeId: str | None = None
    status: str | None = None


class DocumensoWebhookBody(BaseModel):
    model_config = {"extra": "allow"}

    event: str
    payload: WebhookPayload
