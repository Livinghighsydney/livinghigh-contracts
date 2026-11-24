from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=[".env", "../.env"], extra="ignore")

    # Documenso
    documenso_api_key: str
    documenso_base_url: str = "https://app.documenso.com/api/v2"
    documenso_webhook_secret: str = ""

    # Database — Neon
    database_url: str

    # Supabase storage
    supabase_url: str
    supabase_service_key: str
    supabase_storage_bucket: str = "contracts"

    # App
    app_base_url: str = "http://localhost:8000"
    session_secret: str = "change-me-in-production"
    debug: bool = False


settings = Settings()
