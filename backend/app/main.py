import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from tortoise import Tortoise
from tortoise.contrib.fastapi import RegisterTortoise

from app.database import TORTOISE_ORM
from app.services import contract_service
from app.config import settings
from app.controllers import health, contracts, webhooks, templates, auth, team, live as live_ctrl, settings as settings_ctrl

_MIGRATIONS = [
    "ALTER TABLE templates ADD COLUMN IF NOT EXISTS pdf_storage_key VARCHAR(500)",
    "ALTER TABLE templates ADD COLUMN IF NOT EXISTS fields_json JSONB NOT NULL DEFAULT '[]'",
    "ALTER TABLE templates ADD COLUMN IF NOT EXISTS recipient_map JSONB NOT NULL DEFAULT '{}'",
    "ALTER TABLE recipients ADD COLUMN IF NOT EXISTS documenso_recipient_id INT",
    "ALTER TABLE recipients ADD COLUMN IF NOT EXISTS signing_url VARCHAR(1000)",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL",
    "CREATE INDEX IF NOT EXISTS idx_contracts_owner ON contracts(owner_id)",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS custom_values JSONB NOT NULL DEFAULT '{}'",
    # Contract details are optional when the template doesn't print them.
    "ALTER TABLE contracts ALTER COLUMN weekly_rent DROP NOT NULL",
    "ALTER TABLE contracts ALTER COLUMN bond_amount DROP NOT NULL",
    "ALTER TABLE contracts ALTER COLUMN start_date DROP NOT NULL",
    "ALTER TABLE contracts ALTER COLUMN property_address SET DEFAULT ''",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS send_subject VARCHAR(255)",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS send_message TEXT",
    "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS next_send_at TIMESTAMPTZ",
    "CREATE INDEX IF NOT EXISTS idx_contracts_queue ON contracts(status, next_send_at)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)",
]


async def run_migrations() -> None:
    """Create new tables (safe — existing ones untouched), then add new columns. Also used by seed.py."""
    await Tortoise.generate_schemas(safe=True)
    conn = Tortoise.get_connection("default")
    for stmt in _MIGRATIONS:
        await conn.execute_query(stmt)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with RegisterTortoise(app, config=TORTOISE_ORM):
        await run_migrations()
        # Sends contracts that were queued because Documenso rate-limited us.
        worker = asyncio.create_task(contract_service.send_queue_loop())
        # One-time catch-up for anything that happened in Documenso while the backend was off.
        asyncio.create_task(contract_service.catch_up_on_start())
        try:
            yield
        finally:
            worker.cancel()


app = FastAPI(title="Living High Contract API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(contracts.router, prefix="/api/contracts", tags=["contracts"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])
app.include_router(settings_ctrl.router, prefix="/api/settings", tags=["settings"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(team.router, prefix="/api/team", tags=["team"])
app.include_router(live_ctrl.router, prefix="/api", tags=["live"])
