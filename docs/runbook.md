# Runbook

## Tenant says they never received the signing email

1. Check the contract status in the app — if it's `draft`, the email was never sent. Click "Send for Signing".
2. If status is `sent`, check Documenso dashboard for the envelope — Documenso may have delivery info.
3. Ask the tenant to check spam/junk.
4. If needed, resend via Documenso dashboard (or call `POST /api/v2/envelope/redistribute`).
5. Log what happened in the contract's events (manual note if needed).

## Webhook event missed / status stuck

The nightly reconcile job (TODO: implement) calls `GET /api/v2/envelope/{id}` for every
non-final contract and fixes any status mismatch.

To trigger a manual fix:
```
GET /api/v2/envelope/{documenso_envelope_id}
```
Compare the returned `status` with our `contracts.status` and update if different.

## Signed PDF missing from storage

1. Check `files` table — if no row exists, the archive step failed.
2. Manually trigger archive:
   - Get the Documenso envelope ID from the `contracts` table.
   - Call `GET /api/v2/envelope/{id}` to get item IDs.
   - Call `GET /api/v2/envelope/item/{itemId}/download` to get the PDF.
   - Upload to Supabase bucket under `{contract_id}/signed_pdf.pdf`.
   - Insert a row into `files`.

## API key leaked

1. Immediately go to Documenso → Settings → API Tokens and revoke the leaked key.
2. Create a new key.
3. Update `DOCUMENSO_API_KEY` in your hosting environment.
4. Restart the backend.
5. Check event logs for any unexpected API activity.
