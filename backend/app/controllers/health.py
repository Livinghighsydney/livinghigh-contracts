from fastapi import APIRouter
from app.models.contract import Contract

router = APIRouter()


@router.get("/health")
async def health_check():
    try:
        await Contract.all().count()
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok", "db": db_ok}
