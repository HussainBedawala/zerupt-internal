# Inventory Import Template (DEV-430)

Built 2026-06-28 overnight. The inventory twin of the books import template. Canonical
design + decisions: **`erp/docs/inventory-template-import-design.md`** (read §9 for the
morning-review deviations). This note only records what's worth remembering at the study level.

## What it is
A deterministic, server-generated per-tenant `.xlsx` "form not data file" (categories, items,
opening stock). Header-row sniffing in tenant languages; everything structural derived from the
live tenant; preview-before-commit; unknown/ambiguous/held rows surfaced, never auto-created or
posted. Mirrors `apps/api/src/books-import/` 1:1.

## The three lessons worth keeping

1. **1141 ownership must be persisted-state, not a handshake.** A static "TB excludes 1141 when
   inventory comes" rule double-counts any tenant who came through the legacy TB path (which
   *owned* 1141). The durable invariant is **first-writer-wins on persisted state**: whichever
   opening path runs first posts 1141; the later one detects the seeded control and reconciles.
   Inventory posts under its own `ob_inv` document type so it never collides with a TB `ob`
   journal (guard 1a).

2. **You cannot add an enum value and consume it in an index predicate in one migration batch.**
   `drizzle-kit migrate` (and the prod migrator) wrap the whole pending set in one transaction, so
   `ALTER TYPE ADD VALUE 'x'` + an index `WHERE status IN ('x', ...)` fails (55P04). And an
   `enum::text` predicate isn't IMMUTABLE (42P17). The record-before-seed claim was therefore
   modelled as a dedicated nullable `apply_claim_key` column + partial index `WHERE … IS NOT NULL`
   — no new enum value, immutable predicate. **Only caught by running migrate on real Postgres.**

3. **Two-transaction apply needs explicit idempotency + resume.** `createOpeningBalance` (stock
   ledger) and the 1141 GL post commit independently, so a crash between them, or a concurrent
   apply, can double on-hand qty. Fixed with: claim row before any write (fail fast on concurrent),
   `[run:<id>]` reason tag + skip-seeded on resume, `createOrReuseWarehouse` so resume doesn't
   re-create warehouses, advisory lock + re-read around the 1141 post.

## Status
Committed + merged to main **locally, not pushed**. All gates green (typecheck, i18n, 400+ jest,
5-reviewer panel, real-PG migrate, boot-DI). Founder TODO before push: real-editor xlsx round-trip
(Apple Numbers / Google Sheets / Excel), then push to deploy. See memory
`project_inventory_import_template`.
