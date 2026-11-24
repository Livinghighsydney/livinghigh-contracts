# Setup Guide

## Prerequisites
- Python 3.12+
- Node 20+
- A Neon account (PostgreSQL)
- A Supabase account (file storage)
- A Documenso Teams account

## 1. Environment variables

Copy `.env.example` to `.env` at the project root and fill in every value.
See `docs/env-vars.md` for details on each variable.

## 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Run database migrations
aerich init-db
aerich upgrade

# Start the API
uvicorn app.main:app --reload
```

API will be at http://localhost:8000
Health check: http://localhost:8000/health

## 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

App will be at http://localhost:5173

## 4. Supabase storage bucket

In your Supabase project → Storage → New bucket:
- Name: `contracts`
- Public: **No** (private)
- File size limit: 50 MB

## 5. Add a Documenso template

1. Upload your tenancy agreement PDF to Documenso.
2. Add fields: tenant_name, tenant_email, property_address, room_number, weekly_rent, bond_amount, start_date.
3. Copy the template envelope ID.
4. In `backend/app/services/contract_service.py`, add it to `TEMPLATE_MAP`:
   ```python
   TEMPLATE_MAP = {
       "tenancy_standard": "envelope_xxxxxxxxxxxx",
   }
   ```

See `docs/templates.md` for the full field mapping reference.
