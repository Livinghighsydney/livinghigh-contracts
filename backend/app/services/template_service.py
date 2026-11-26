import logging
from app.models.template import Template
from app.services import documenso_client, storage
from app.utils.pdf_normalize import normalize_page_boxes

logger = logging.getLogger(__name__)


async def create_template(
    name: str,
    template_key: str,
    description: str,
    created_by: str,
    pdf_bytes: bytes,
    filename: str,
) -> Template:
    # Give every page an explicit size so Documenso places field text exactly where staff put it
    pdf_bytes = normalize_page_boxes(pdf_bytes)

    # Store PDF in Supabase so the field-placement UI can load it
    storage_key = f"templates/{template_key}/original.pdf"
    await storage.upload(storage_key, pdf_bytes)

    # Create template in Documenso with a placeholder Tenant recipient
    result = await documenso_client.create_template(name, pdf_bytes, filename)
    documenso_id = result.get("envelopeId") or result.get("id")

    # Fetch the envelope to get the numeric recipient ID assigned by Documenso
    recipient_map: dict = {}
    if documenso_id:
        try:
            envelope = await documenso_client.get_envelope(documenso_id)
            # Response may be nested under "envelope" key or flat
            recipients = (
                envelope.get("recipients")
                or envelope.get("envelope", {}).get("recipients")
                or []
            )
            for r in recipients:
                name_val = (r.get("name") or "").lower()
                r_id = r.get("id")
                if r_id and "tenant" in name_val:
                    recipient_map["tenant"] = r_id
        except Exception as exc:
            logger.warning("Could not fetch recipient IDs after template creation: %s", exc)

    return await Template.create(
        name=name,
        template_key=template_key,
        description=description,
        documenso_template_id=documenso_id,
        pdf_storage_key=storage_key,
        recipient_map=recipient_map,
        created_by=created_by,
    )


async def get_pdf_url(template_id: str) -> str:
    template = await Template.get_or_none(id=template_id, is_active=True)
    if not template or not template.pdf_storage_key:
        raise ValueError("Template not found or PDF not stored")
    return await storage.signed_url(template.pdf_storage_key, expires_in=3600)


async def save_template_fields(template_id: str, fields: list[dict]) -> Template:
    template = await Template.get_or_none(id=template_id, is_active=True)
    if not template:
        raise ValueError("Template not found")
    if not template.documenso_template_id:
        raise ValueError("Template has no Documenso ID — re-upload the template")
    if not template.recipient_map:
        raise ValueError("Template has no recipients configured — re-upload the template")
    if not any(f["type"] == "SIGNATURE" for f in fields):
        raise ValueError("Add at least one Signature box before saving")

    # Replace, don't append: remove the fields Documenso currently has on this template.
    envelope = await documenso_client.get_envelope(template.documenso_template_id)
    for existing in envelope.get("fields") or []:
        if existing.get("id") is not None:
            await documenso_client.delete_field(existing["id"])

    documenso_fields = [_to_documenso_field(f, template.recipient_map) for f in fields]
    created = await documenso_client.create_fields(template.documenso_template_id, documenso_fields)
    if len(created) != len(fields):
        raise ValueError("Documenso did not create all fields — please try saving again")

    # Remember each field's Documenso ID: data boxes are pre-filled by ID when a contract is sent.
    for f, c in zip(fields, created):
        f["documensoFieldId"] = c.get("id")

    template.fields_json = fields
    await template.save(update_fields=["fields_json", "updated_at"])
    return template


def _to_documenso_field(f: dict, recipient_map: dict) -> dict:
    role = f.get("recipient", "tenant")
    out: dict = {
        "type": f["type"],
        "recipientId": recipient_map.get(role) or next(iter(recipient_map.values())),
        "page": f["page"],
        "positionX": f["positionX"],
        "positionY": f["positionY"],
        "width": f["width"],
        "height": f["height"],
    }
    if f.get("dataKey"):
        # Data box: shows a contract detail. The tenant can see it but not change it.
        out["type"] = "TEXT"
        out["fieldMeta"] = {
            "type": "text",
            "label": f.get("label") or f["dataKey"],
            "readOnly": True,
            "required": False,
        }
    elif f["type"] == "TEXT":
        out["fieldMeta"] = {"type": "text", "label": f.get("label") or "", "required": True}
    return out


async def list_templates() -> list[Template]:
    return await Template.filter(is_active=True)


async def deactivate_template(template_id: str) -> None:
    template = await Template.get_or_none(id=template_id)
    if template:
        template.is_active = False
        await template.save(update_fields=["is_active", "updated_at"])
