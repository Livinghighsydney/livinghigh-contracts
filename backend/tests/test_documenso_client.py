import pytest
from unittest.mock import AsyncMock, patch
from app.services.documenso_client import use_template


@pytest.mark.asyncio
async def test_use_template_builds_correct_payload():
    mock_resp = AsyncMock()
    mock_resp.json.return_value = {"envelopeId": "env_abc"}
    mock_resp.status_code = 200

    with patch("app.services.documenso_client.request_with_retry", return_value=mock_resp):
        result = await use_template(
            template_envelope_id="tmpl_123",
            recipients=[{"email": "t@test.com", "name": "Test", "role": "SIGNER"}],
            prefill_fields=[{"type": "TEXT", "label": "tenant_name", "value": "Test"}],
            send_now=True,
        )

    assert result["envelopeId"] == "env_abc"


@pytest.mark.asyncio
async def test_use_template_includes_external_id():
    mock_resp = AsyncMock()
    mock_resp.json.return_value = {"envelopeId": "env_xyz"}
    mock_resp.status_code = 200

    captured = {}

    async def capture(client, method, url, json=None, **kwargs):
        captured["body"] = json
        return mock_resp

    with patch("app.services.documenso_client.request_with_retry", side_effect=capture):
        await use_template("tmpl_1", [], [], external_id="my-contract-id")

    assert captured["body"]["externalId"] == "my-contract-id"
