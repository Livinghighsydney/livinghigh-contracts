# Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DOCUMENSO_API_KEY` | Yes | From Documenso → Settings → API Tokens |
| `DOCUMENSO_BASE_URL` | No | Default: `https://app.documenso.com/api/v2` |
| `DOCUMENSO_WEBHOOK_SECRET` | Yes (prod) | Set in Documenso webhook config; used to verify incoming events |
| `DATABASE_URL` | Yes | Neon connection string — `postgresql://user:pass@host/db?sslmode=require` |
| `SUPABASE_URL` | Yes | From Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Yes | From Supabase → Project Settings → API → `service_role` key (not the anon key) |
| `SUPABASE_STORAGE_BUCKET` | No | Default: `contracts` |
| `APP_BASE_URL` | No | Used for webhook registration; default: `http://localhost:8000` |
| `SESSION_SECRET` | Yes (prod) | Random string ≥ 32 chars; used for session signing |

## Rotating the Documenso API key

1. Go to Documenso → Settings → API Tokens → Create new token.
2. Update `DOCUMENSO_API_KEY` in your secrets manager / hosting env.
3. Restart the backend.
4. Delete the old token in Documenso.
