"""Business logic layer. Controllers call this; this calls models + external services."""
from app.models.contract import Contract, ContractStatus
from app.models.event import Event
from app.models.file import ContractFile, FileKind
from app.schemas.contract import CreateContractRequest
from app.services import documenso_client, storage
from app.utils.hashing import sha256_hex

# Map our internal template key → Documenso template envelope ID.
# Add entries here when you create templates in Documenso.
TEMPLATE_MAP: dict[str, str] = {
    # "tenancy_standard": "envelope_xxxxxxxxxxxx",
}

_WEBHOOK_STATUS_MAP: dict[str, ContractStatus] = {
    "ENVELOPE_SENT": ContractStatus.SENT,
    "ENVELOPE_OPENED": ContractStatus.VIEWED,
    "ENVELOPE_COMPLETED": ContractStatus.COMPLETED,
    "ENVELOPE_REJECTED": ContractStatus.REJECTED,
    "ENVELOPE_CANCELLED": ContractStatus.CANCELLED,
}


async def create_contract(data: CreateContractRequest) -> Contract:
    contract = await Contract.create(**data.model_dump(), status=ContractStatus.DRAFT)
    await _log(contract, "contract.created", {"created_by": data.created_by})
    return contract


async def send_contract(contract: Contract) -> Contract:
    tmpl_id = TEMPLATE_MAP.get(contract.template_key)
    if not tmpl_id:
        raise ValueError(f"No Documenso template mapped for key '{contract.template_key}'")

    result = await documenso_client.use_template(
        template_envelope_id=tmpl_id,
        recipients=[_build_recipient(contract)],
        prefill_fields=_build_prefill(contract),
        external_id=str(contract.id),
        send_now=True,
    )

    envelope_id = result.get("envelopeId") or result.get("id")
    contract.documenso_envelope_id = envelope_id
    contract.status = ContractStatus.SENT
    await contract.save(update_fields=["documenso_envelope_id", "status", "updated_at"])
    await _log(contract, "contract.sent", {"envelope_id": envelope_id})
    return contract


async def handle_webhook(event_type: str, payload: dict) -> None:
    envelope_id = payload.get("envelopeId", "")
    contract = await Contract.get_or_none(documenso_envelope_id=envelope_id)
    if not contract:
        return

    new_status = _WEBHOOK_STATUS_MAP.get(event_type)
    if new_status:
        contract.status = new_status
        await contract.save(update_fields=["status", "updated_at"])

    await _log(contract, event_type.lower(), payload)

    if new_status == ContractStatus.COMPLETED:
        await _archive(contract)


async def _archive(contract: Contract) -> None:
    """Download signed PDF + certificate from Documenso and store in Supabase."""
    envelope = await documenso_client.get_envelope(contract.documenso_envelope_id)

    # Documenso returns items (documents) inside the envelope.
    # Inspect the actual response during trial and adjust the key names below.
    for item in envelope.get("items", []):
        item_id = str(item.get("id", ""))
        raw_type = str(item.get("type", "")).lower()
        kind = FileKind.CERTIFICATE if "certificate" in raw_type else FileKind.SIGNED_PDF

        data = await documenso_client.download_envelope_item(item_id)
        key = f"{contract.id}/{kind.value}.pdf"

        await storage.upload(key, data)
        await ContractFile.create(
            contract=contract,
            kind=kind,
            storage_key=key,
            sha256=sha256_hex(data),
        )

    contract.status = ContractStatus.ARCHIVED
    await contract.save(update_fields=["status", "updated_at"])
    await _log(contract, "contract.archived", {})


def _build_recipient(contract: Contract) -> dict:
    return {
        "email": contract.tenant_email,
        "name": contract.tenant_name,
        "role": "SIGNER",
    }


def _build_prefill(contract: Contract) -> list[dict]:
    return [
        {"type": "TEXT", "label": "tenant_name",      "value": contract.tenant_name},
        {"type": "TEXT", "label": "tenant_email",     "value": contract.tenant_email},
        {"type": "TEXT", "label": "property_address", "value": contract.property_address},
        {"type": "TEXT", "label": "room_number",      "value": contract.room_number or ""},
        {"type": "TEXT", "label": "weekly_rent",      "value": str(contract.weekly_rent)},
        {"type": "TEXT", "label": "bond_amount",      "value": str(contract.bond_amount)},
        {"type": "DATE", "label": "start_date",       "value": str(contract.start_date)},
    ]


async def _log(contract: Contract, event_type: str, payload: dict) -> None:
    await Event.create(contract=contract, type=event_type, payload=payload)
