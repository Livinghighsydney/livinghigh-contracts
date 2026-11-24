# Template Field Mapping

## How templates work

Each contract type has a `template_key` (e.g. `tenancy_standard`).  
`TEMPLATE_MAP` in `contract_service.py` maps this key to a Documenso template envelope ID.  
`_build_prefill()` maps our contract fields to Documenso field labels.

## Adding a new template

1. Upload the PDF to Documenso and add fields with these exact labels:

| Documenso field label | Our field | Type |
|---|---|---|
| `tenant_name` | `contract.tenant_name` | TEXT |
| `tenant_email` | `contract.tenant_email` | TEXT |
| `property_address` | `contract.property_address` | TEXT |
| `room_number` | `contract.room_number` | TEXT |
| `weekly_rent` | `contract.weekly_rent` | TEXT |
| `bond_amount` | `contract.bond_amount` | TEXT |
| `start_date` | `contract.start_date` | DATE |
| `signature` | tenant signature field | SIGNATURE |

2. Copy the template envelope ID from Documenso.

3. Add to `TEMPLATE_MAP` in `backend/app/services/contract_service.py`:
   ```python
   TEMPLATE_MAP = {
       "tenancy_standard": "envelope_your_id_here",
   }
   ```

4. If the new template needs extra fields, add them to `_build_prefill()` in the same file.

## Template versioning

The `template_version` field on each contract records which version of the template was used.  
Increment it in `TEMPLATE_MAP` or store it separately when you update a template PDF.
