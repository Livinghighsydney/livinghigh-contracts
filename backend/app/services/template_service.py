import logging
from app.models.template import Template
from app.services import documenso_client, live, storage
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

    template = await Template.create(
        name=name,
        template_key=template_key,
        description=description,
        documenso_template_id=documenso_id,
        pdf_storage_key=storage_key,
        recipient_map=recipient_map,
        created_by=created_by,
    )
    live.templates_changed()
    return template


async def get_pdf_url(template_id: str) -> str:
    template = await Template.get_or_none(id=template_id, is_active=True)
    if not template or not template.pdf_storage_key:
        raise ValueError("Template not found or PDF not stored")
    return await storage.signed_url(template.pdf_storage_key, expires_in=3600)


async def get_pdf_bytes(template_id: str) -> bytes:
    template = await Template.get_or_none(id=template_id, is_active=True)
    if not template or not template.pdf_storage_key:
        raise ValueError("Template not found or PDF not stored")
    return await storage.download(template.pdf_storage_key)


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
    live.templates_changed()
    return template


def _to_documenso_field(f: dict, recipient_map: dict) -> dict:
    """Our editor field → Documenso create-many item (v2 spec fieldMeta per type)."""
    role = f.get("recipient", "tenant")
    ftype = "TEXT" if f.get("dataKey") else f["type"]
    out: dict = {
        "type": ftype,
        "recipientId": recipient_map.get(role) or next(iter(recipient_map.values())),
        "page": f["page"],
        "positionX": f["positionX"],
        "positionY": f["positionY"],
        "width": f["width"],
        "height": f["height"],
    }

    meta: dict = {"type": ftype.lower()}
    common = {
        "label": f.get("label"),
        "placeholder": f.get("placeholder"),
        "fontSize": f.get("fontSize"),
    }
    meta.update({k: v for k, v in common.items() if v not in (None, "")})

    if f.get("dataKey"):
        # Data box: shows a contract detail. The tenant can see it but not change it.
        meta.update({"label": f.get("label") or f["dataKey"], "readOnly": True, "required": False})
    elif f.get("staffFill"):
        # Staff answer it when creating the contract; prefilled and (unless allowed) locked for the tenant.
        meta.update({"readOnly": not f.get("tenantEditable"), "required": False})
    else:
        meta["required"] = bool(f.get("required", True))

    if ftype in ("TEXT", "NUMBER", "NAME", "EMAIL", "DATE", "INITIALS") and f.get("textAlign"):
        meta["textAlign"] = f["textAlign"]
    if ftype == "TEXT" and f.get("characterLimit") and not f.get("dataKey"):
        meta["characterLimit"] = f["characterLimit"]
    if ftype == "NUMBER":
        if f.get("minValue") is not None:
            meta["minValue"] = f["minValue"]
        if f.get("maxValue") is not None:
            meta["maxValue"] = f["maxValue"]
    if f.get("tickOnly"):
        # Box only (sits exactly over the box printed on the PDF), or box + text when "show text" is on.
        meta["values"] = [{"id": 1, "checked": False, "value": tick_text(f)}]
        meta["direction"] = "vertical"
        if f.get("group"):
            meta["label"] = f"{f['group']}: {f.get('optionLabel') or ''}".strip(": ")
    elif ftype in ("CHECKBOX", "RADIO"):
        meta["fontSize"] = choice_font_size(f)
        default = f.get("defaultOption") if ftype == "RADIO" else None
        meta["values"] = [
            {"id": i + 1, "checked": opt == default, "value": opt}
            for i, opt in enumerate(f.get("options") or [])
        ]
        meta["direction"] = f.get("direction") or "vertical"
    if ftype == "DROPDOWN":
        meta["values"] = [{"value": opt} for opt in f.get("options") or []]
        if f.get("defaultOption"):
            meta["defaultValue"] = f["defaultOption"]

    out["fieldMeta"] = meta
    return out


_PAGE_W_PT, _PAGE_H_PT = 595, 842  # A4


def choice_font_size(f: dict) -> int | None:
    """Radio/checkbox size. Documenso draws each circle/box as big as the font size (8 pt padding),
    so with no size chosen we pick the biggest that fits the field box. Same as the editor's
    choiceFontSize (frontend/src/lib/contracts.ts)."""
    if f.get("type") not in ("RADIO", "CHECKBOX") or f.get("tickOnly"):
        return None
    if f.get("fontSize"):
        return int(f["fontSize"])
    options = [o for o in (f.get("options") or []) if o.strip()]
    n = max(1, len(options))
    across = f.get("direction") == "horizontal"
    h = f["height"] / 100 * _PAGE_H_PT - 16
    w = f["width"] / 100 * _PAGE_W_PT - 8
    longest = max([1, *(len(o) for o in options)])
    by_height = (h if across else h / n) * 0.8
    by_width = ((w / n if across else w) - 16) / (1 + 0.55 * longest)
    return round(min(96, max(8, min(by_height, by_width))))


def tick_text(f: dict) -> str:
    """Text printed next to a tick box: empty unless "show text" is on."""
    if not f.get("showText"):
        return ""
    text = f.get("optionLabel") if f.get("staffFill") else f.get("label")
    return (text or "").strip()


async def list_templates() -> list[Template]:
    return await Template.filter(is_active=True)


async def deactivate_template(template_id: str) -> None:
    template = await Template.get_or_none(id=template_id)
    if template:
        template.is_active = False
        await template.save(update_fields=["is_active", "updated_at"])
        live.templates_changed()
