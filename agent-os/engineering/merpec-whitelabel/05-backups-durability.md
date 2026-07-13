# 05 — Backups & Durability (gates the first paying customer, brand-independent)

Principle (from decisions.md §9): no single provider ever holds the only copy of tenant data. Neon is primary; independent logical backups make the data portable and provider-proof.

## Layers

1. **Neon PITR:** set retention to the plan maximum (7d Launch / 30d Scale) + enable branch protection on the prod branch. Existing open founder to-do — do first, zero code.
2. **Nightly logical export:** pg-boss cron job in the API (reuse existing queue infra, no new services):
   - Iterate `tenant_databases` registry + the admin DB.
   - `pg_dump -Fc` each database (ensure the `pg_dump` client binary matches Neon's Postgres major version; run sequentially or small-batch to avoid waking/loading the shared endpoint at peak — schedule during Gulf night).
   - Encrypt (age or AES-256-GCM with a dedicated backup key — NOT the tenant-credential `DB_ENCRYPTION_KEY_V1`; a leaked backup key must not unlock live credentials, and vice versa).
   - Upload to Cloudflare R2 (S3 API): `backups/{env}/{tenantId}/{yyyy-mm-dd}.dump.age`.
   - Record result per tenant in a `backup_runs` admin table (started/completed/bytes/sha256/error) — a backup with no audit row is treated as failed. Alert (internal notification) on any failure; silence is not success.
3. **Second provider copy:** replicate the R2 prefix to Backblaze B2 (or S3) — R2 egress is free, so this costs ~storage only.
4. **Retention:** dailies 30 days, monthlies 12 months, then 1/year kept indefinitely (retail ERP data is small; indefinite yearly is dollars).

## Restore drills (quarterly)

Restore a randomly chosen tenant's latest dump into a scratch Neon branch/database; verify row counts of the top tables against the live tenant and the trial balance if accounting data is present; log the drill in `study/ops/`. Automate later; manual first drill within a month of the job shipping.

## Cost

R2 $0.015/GB-mo + B2 similar; at hundreds of tenants with sub-GB databases this is single-digit dollars per month.

## Explicit non-goals

- Not a replacement for PITR (PITR is the fast operational restore; dumps are the catastrophe/portability layer).
- No customer-facing backup/export UI here (that's a product feature, separate track).
