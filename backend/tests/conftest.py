import pytest
from unittest.mock import AsyncMock, patch


@pytest.fixture
def mock_documenso():
    with patch("app.services.documenso_client.use_template", new_callable=AsyncMock) as m:
        m.return_value = {"envelopeId": "test_envelope_123"}
        yield m


@pytest.fixture
def mock_storage():
    with patch("app.services.storage.upload", new_callable=AsyncMock) as m:
        m.return_value = "test/key.pdf"
        yield m
