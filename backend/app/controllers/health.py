from fastapi import APIRouter
from tortoise import Tortoise

router = APIRouter()


@router.get("/health")
async def health_check():
    try:
        conn = Tortoise.get_connection("default")
        await conn.execute_query("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok", "db": db_ok}
