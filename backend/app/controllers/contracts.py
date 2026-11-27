from fastapi import APIRouter, Depends, HTTPException
from app.deps import current_user
from app.models.contract import Contract
from app.models.user import User
from app.services.auth_service import can_access_contract, sees_all_contracts
from app.schemas.contract import CreateContractRequest, SendContractRequest, ContractSummary, ContractDetail
import re
from app.models.file import ContractFile, FileKind
from app.services import contract_service, storage

router = APIRouter()


@router.post("/", status_code=201)
async def create_contract(body: CreateContractRequest, user: User = Depends(current_user)):
    try:
        contract = await contract_service.create_contract(body, owner=user)
    except ValueError as e:  # a staff answer doesn't match the template
        raise HTTPException(status_code=400, detail=str(e))
    return {"id": str(contract.id), "status": contract.status}


@router.post("/{contract_id}/send")
async def send_contract(contract_id: str, body: SendContractRequest | None = None, user: User = Depends(current_user)):
    contract = await _get_or_404(contract_id, user)
    if contract.status.value != "draft":
        raise HTTPException(status_code=400, detail="Only draft contracts can be sent")
    body = body or SendContractRequest()
    try:
        contract = await contract_service.send_contract(
            contract, subject=body.email_subject, message=body.email_message
        )
    except ValueError as e:  # includes DocumensoError — message is safe to show staff
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "id": str(contract.id),
        "status": contract.status,
        "next_send_at": contract.next_send_at,  # set when queued (Documenso rate limit)
    }


@router.post("/{contract_id}/resend-email")
async def resend_email(contract_id: str, user: User = Depends(current_user)):
    contract = await _get_or_404(contract_id, user)
    try:
        kind = await contract_service.resend_email(contract)
    except ValueError as e:  # includes EmailError — message is safe to show staff
        raise HTTPException(status_code=400, detail=str(e))
    return {"sent": kind}


@router.post("/{contract_id}/cancel")
async def cancel_contract(contract_id: str, user: User = Depends(current_user)):
    contract = await _get_or_404(contract_id, user)
    try:
        contract = await contract_service.cancel_contract(contract)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"id": str(contract.id), "status": contract.status}


@router.post("/{contract_id}/sync")
async def sync_contract(contract_id: str, user: User = Depends(current_user)):
    """'Check status now': ask Documenso and catch up on anything missed."""
    contract = await _get_or_404(contract_id, user)
    try:
        changed = await contract_service.sync_contract(contract)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await contract.refresh_from_db()
    return {"id": str(contract.id), "status": contract.status, "changed": changed}


@router.get("/overview")
async def contracts_overview(user: User = Depends(current_user)):
    """Contracts with their timelines. Admins/Managers see all; Members see their own."""
    return await contract_service.overview(None if sees_all_contracts(user) else user)


@router.get("/{contract_id}/files/{kind}")
async def download_file(contract_id: str, kind: FileKind, user: User = Depends(current_user)):
    """Short-lived download link for the signed PDF or the certificate from our own storage."""
    contract = await _get_or_404(contract_id, user)
    f = await ContractFile.filter(contract=contract, kind=kind).first()
    if not f and kind == FileKind.AUDIT_LOG:
        f = await contract_service.ensure_audit_log(contract)  # older contracts: fetch it now
    if not f:
        raise HTTPException(status_code=404, detail="This file isn't available yet. It appears once the tenant has signed.")
    safe = re.sub(r"[^A-Za-z0-9 _-]", "", contract.tenant_name).strip().replace(" ", "-").lower() or "contract"
    names = {FileKind.SIGNED_PDF: "signed-agreement", FileKind.CERTIFICATE: "certificate", FileKind.AUDIT_LOG: "audit-log"}
    filename = f"{safe}-{names[kind]}.pdf"
    return {"url": await storage.signed_url(f.storage_key, expires_in=300, download=filename)}


@router.get("/", response_model=list[ContractSummary])
async def list_contracts(user: User = Depends(current_user)):
    q = Contract.all() if sees_all_contracts(user) else Contract.filter(owner_id=user.id)
    return await q


@router.get("/{contract_id}", response_model=ContractDetail)
async def get_contract(contract_id: str, user: User = Depends(current_user)):
    return await _get_or_404(contract_id, user)


async def _get_or_404(contract_id: str, user: User) -> Contract:
    try:
        contract = await Contract.get_or_none(id=contract_id)
    except Exception:  # malformed id
        contract = None
    # Same answer for "doesn't exist" and "not yours" — don't reveal other people's contracts.
    if not contract or not can_access_contract(user, contract):
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract
