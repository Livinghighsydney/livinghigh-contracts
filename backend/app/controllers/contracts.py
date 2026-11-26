from fastapi import APIRouter, HTTPException
from app.models.contract import Contract
from app.schemas.contract import CreateContractRequest, SendContractRequest, ContractSummary, ContractDetail
from app.services import contract_service

router = APIRouter()


@router.post("/", status_code=201)
async def create_contract(body: CreateContractRequest):
    contract = await contract_service.create_contract(body)
    return {"id": str(contract.id), "status": contract.status}


@router.post("/{contract_id}/send")
async def send_contract(contract_id: str, body: SendContractRequest | None = None):
    contract = await _get_or_404(contract_id)
    if contract.status.value != "draft":
        raise HTTPException(status_code=400, detail="Only draft contracts can be sent")
    body = body or SendContractRequest()
    try:
        contract = await contract_service.send_contract(
            contract, subject=body.email_subject, message=body.email_message
        )
    except ValueError as e:  # includes DocumensoError — message is safe to show staff
        raise HTTPException(status_code=400, detail=str(e))
    return {"id": str(contract.id), "status": contract.status}


@router.post("/{contract_id}/resend-email")
async def resend_email(contract_id: str):
    contract = await _get_or_404(contract_id)
    try:
        kind = await contract_service.resend_email(contract)
    except ValueError as e:  # includes EmailError — message is safe to show staff
        raise HTTPException(status_code=400, detail=str(e))
    return {"sent": kind}


@router.get("/", response_model=list[ContractSummary])
async def list_contracts():
    return await Contract.all()


@router.get("/{contract_id}", response_model=ContractDetail)
async def get_contract(contract_id: str):
    return await _get_or_404(contract_id)


async def _get_or_404(contract_id: str) -> Contract:
    contract = await Contract.get_or_none(id=contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract
