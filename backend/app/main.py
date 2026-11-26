from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from tortoise import Tortoise
from tortoise.contrib.fastapi import RegisterTortoise

from app.database import TORTOISE_ORM
from app.controllers import health, contracts, webhooks, templates

_MIGRATIONS = [
    "ALTER TABLE templates ADD COLUMN IF NOT EXISTS pdf_storage_key VARCHAR(500)",
    "ALTER TABLE templates ADD COLUMN IF NOT EXISTS fields_json JSONB NOT NULL DEFAULT '[]'",
    "ALTER TABLE templates ADD COLUMN IF NOT EXISTS recipient_map JSONB NOT NULL DEFAULT '{}'",
    "ALTER TABLE recipients ADD COLUMN IF NOT EXISTS documenso_recipient_id INT",
    "ALTER TABLE recipients ADD COLUMN IF NOT EXISTS signing_url VARCHAR(1000)",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with RegisterTortoise(app, config=TORTOISE_ORM):
        conn = Tortoise.get_connection("default")
        for stmt in _MIGRATIONS:
            await conn.execute_query(stmt)
        yield


app = FastAPI(title="Living High Contract API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(contracts.router, prefix="/api/contracts", tags=["contracts"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])
