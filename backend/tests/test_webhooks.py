import pytest
import hmac
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

VALID_SECRET = "test-secret"
VALID_BODY = {
    "event": "ENVELOPE_COMPLETED",
    "payload": {"envelopeId": "env_123", "status": "COMPLETED"},
}


def test_webhook_rejects_wrong_secret(monkeypatch):
    monkeypatch.setattr("app.config.settings.documenso_webhook_secret", VALID_SECRET)
    resp = client.post(
        "/api/webhooks/documenso",
        json=VALID_BODY,
        headers={"x-documenso-secret": "wrong-secret"},
    )
    assert resp.status_code == 401


def test_webhook_accepts_correct_secret(monkeypatch):
    monkeypatch.setattr("app.config.settings.documenso_webhook_secret", VALID_SECRET)
    with patch("app.controllers.webhooks.contract_service.handle_webhook", new_callable=AsyncMock):
        resp = client.post(
            "/api/webhooks/documenso",
            json=VALID_BODY,
            headers={"x-documenso-secret": VALID_SECRET},
        )
    assert resp.status_code == 200
    assert resp.json() == {"received": True}


def test_webhook_no_secret_configured_passes(monkeypatch):
    monkeypatch.setattr("app.config.settings.documenso_webhook_secret", "")
    with patch("app.controllers.webhooks.contract_service.handle_webhook", new_callable=AsyncMock):
        resp = client.post("/api/webhooks/documenso", json=VALID_BODY)
    assert resp.status_code == 200
