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

    # Outgoing email — all tenant emails come from Living High's own mailbox (SMTP).
    # Google Workspace: smtp.gmail.com / 587 + an app password.
    # Microsoft 365:    smtp.office365.com / 587.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    email_from: str = ""            # e.g. contracts@livinghigh.com.au
    email_from_name: str = "Living High"
    email_reply_to: str = ""        # optional; defaults to email_from

    # App
    app_base_url: str = "http://localhost:8000"
    session_secret: str = "change-me-in-production"
    debug: bool = False


settings = Settings()
