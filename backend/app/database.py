from urllib.parse import urlparse, parse_qs
from tortoise import Tortoise
from app.config import settings

MODELS = [
    "app.models.contract",
    "app.models.recipient",
    "app.models.event",
    "app.models.file",
    "app.models.template",
    "app.models.user",
    "app.models.setting",
]


def _build_config(url: str) -> dict:
    p = urlparse(url)
    ssl = parse_qs(p.query).get("sslmode", [""])[0] in ("require", "verify-ca", "verify-full")
    return {
        "connections": {
            "default": {
                "engine": "tortoise.backends.asyncpg",
                "credentials": {
                    "host": p.hostname,
                    "port": p.port or 5432,
                    "user": p.username,
                    "password": p.password,
                    "database": p.path.lstrip("/"),
                    "ssl": ssl,
                },
            }
        },
        "apps": {
            "models": {"models": MODELS, "default_connection": "default"}
        },
    }


TORTOISE_ORM = _build_config(settings.database_url)


async def init_db() -> None:
    await Tortoise.init(config=TORTOISE_ORM)


async def close_db() -> None:
    await Tortoise.close_connections()
