# Settings & Admin — Batch A (Identity & Access) Testing Guide

> Manual / dogfood QA pack for VIEWS 1-5 (the L1 control plane). Execute against a running app +
> verify from the tenant/admin DBs and the audit log. Personas: **owner delegating access** and
> **sysadmin who fears a leak** — the negative/security cases matter as much as the happy paths.
> Shipped commits: V1 `52addb45` · V2 `1e8775bf` · V3 `9a4a1104` · V4 `80df2a8a` · V5 `8405cf5b`.

---

## 0. Preconditions

### 0.1 Migrations MUST be applied first
These features write/read columns added by Batch A migrations. **They will error or silently
no-op against a tenant DB that has not been migrated.**
- Tenant DB: **0158** (recovery contact), **0159** (invitation token hash), **0160** (role name index).
- Apply via Railway pre-deploy on deploy, or manually (see `project_manual_tenant_migration`), then
  verify from the actual DB before testing. VIEW 5 needs no migration.

### 0.2 Known NOT-yet-working (do NOT file these as bugs — open founder decisions F1-F5)
| Ref | Behaviour you will observe | Status |
|-----|----------------------------|--------|
| F1 | `POST /tenant/invitations` + accept never actually adds the user to the tenant | dead module; use the **team invite** flow (`POST /tenant/users/invite`) instead |
| F2/F4 | An invite/role editor can grant a role carrying keys they don't hold | permission-ceiling not enforced yet |
| F3 | A role set to "hide cost" does NOT hide cost in inventory/reports responses | field masks stored but not enforced at read time (UI labels it "rolling out") |
| F5 | (fixed for PIN reset) other body-only delete routes may under-audit | systemic, L5 |

### 0.3 Seed data — create these once, reference throughout

**Tenant:** `Acme Group` (any active tenant with ≥1 branch and ≥1 active legal entity).

**Users** (create via team invite; all password `Test1234!` unless noted):
| Handle | Email | Coarse role | Purpose |
|--------|-------|-------------|---------|
| OWNER | `owner@acme.test` | Owner | the current owner |
| OWNER2 | `owner2@acme.test` | Member (Admin-ish) | owner-transfer target; PIN reset actor |
| ADMIN | `admin@acme.test` | Member + a role holding `settings.approvalpin.reset` | non-owner admin |
| MGR | `manager@acme.test` | Member | forgets PIN; branch-scoped |
| CASHIER | `cashier@acme.test` | Member | low-privilege; escalation-probe subject |

**Approval PINs:** OWNER = `4729`, MGR = `1357`, OWNER2 = `8080`. Invalid samples: `12` (too short),
`123456789` (too long), `abcd` (non-numeric).

**Reason strings** (Critical-change class requires a reason): `"Founder sold the shop to co-owner"`,
`"Manager forgot PIN at till"`. Blank/whitespace reason must be rejected.

**Recovery contact:** name `Aisha Recovery`, email `recovery@acme.test`; invalid email `not-an-email`.

**Role names (case test):** `Cashier`, then try `cashier`, `CASHIER`.

**Branch names:** `Main Outlet`, `Warehouse Downtown`.

### 0.4 Where to verify
- **Tenant DB** tables: `tenant_identity`, `roles`, `role_permissions`, `invitations`,
  `user_approval_pins`, `audit_logs`.
- **Admin DB** table: `user_tenant_map` (the coarse `role` = owner/member — source of truth for owner).
- **Audit:** Settings → Compliance & Audit → Audit Trail (or `SELECT ... FROM audit_logs ORDER BY
  created_at DESC`). Every mutation below must produce exactly one immutable row with actor + entity.

---

## VIEW 1 — Security settings (`52addb45`, mig 0157)

| # | Case | Steps / data | Expected |
|---|------|--------------|----------|
| 1.1 | Idle timeout enforced | Set idle timeout low; leave a session idle past it | Next request 401 `IDLE`; FE signs out cleanly (no loop) |
| 1.2 | Concurrent-session cap | Set cap = 1; sign in twice as MGR | Oldest session evicted; only newest works |
| 1.3 | IP allowlist fail-closed | Add a CIDR that excludes your IP | Request rejected `IP_NOT_ALLOWED`; adding your CIDR restores access |
| 1.4 | IP allowlist rejects garbage | Enter `999.999.999.999` | Rejected at validation (not stored) |
| 1.5 | MFA anti-lockout | With no aal2 session, try to set mfaPolicy=all | Blocked (needs an aal2 session first) |
| 1.6 | Change-password chokepoint | Change password with wrong current password | Rejected; per-account lockout after repeated wrong attempts; other sessions revoked on success |
| 1.7 | Sessions & Devices | Open the panel; revoke one session; "sign out others" | Listed sessions revoke individually; audit row per revoke |

Verify: `audit_logs` has a row per session revoke / policy change. Perf sanity: steady-state requests
add no extra DB round-trip (30s caches).

---

## VIEW 2 — Company: C1 gate + owner transfer + recovery contact (`1e8775bf`, mig 0158)

### C1 — tenant/settings permission gate
| # | Case | Steps / data | Expected |
|---|------|--------------|----------|
| 2.1 | Member blocked from renaming | As CASHIER (no `settings.tenant.update`): `PATCH /tenant/settings {name:"Hacked"}` | **403** |
| 2.2 | Member blocked from logo | As CASHIER: `POST /tenant/settings/logo` | **403** |
| 2.3 | Owner/Admin allowed | As OWNER: same PATCH | 200; audit row `TenantIdentity` |
| 2.4 | Read still open | As CASHIER: `GET /tenant/settings` | 200 (read is not the hole) |

### Recovery contact (S3)
| # | Case | Data | Expected |
|---|------|------|----------|
| 2.5 | Set recovery contact | name `Aisha Recovery`, email `recovery@acme.test` | Saved; `tenant_identity.recovery_contact_email/name` populated; audited |
| 2.6 | Invalid email | `not-an-email` | Inline field error before submit; server rejects |
| 2.7 | Clear it | blank both | Nulled; round-trips |

### Owner transfer (S1) — the auth heart
Endpoint `POST /tenant/users/transfer-ownership {targetUserId, pin, reason}`, OwnerGuard + throttle.
| # | Case | Actor / data | Expected |
|---|------|--------------|----------|
| 2.8 | Happy transfer | OWNER, target=OWNER2, pin=`4729`, reason set | 200; **OWNER2 is now Owner, OWNER demoted to Member**; OWNER's sessions revoked (must re-auth); audit row with reason + before/after roles |
| 2.9 | Wrong PIN | OWNER, pin=`0000` | Generic 422 `PIN_INVALID`; no role change; repeated wrong PINs lock out (own-account) |
| 2.10 | No PIN set | An owner who never set a PIN | Distinct actionable error `PIN_NOT_SET` ("set your approval PIN first") — this is the caller's own account so it's allowed to be specific |
| 2.11 | Self-transfer | target = OWNER | Rejected `TRANSFER_SELF` |
| 2.12 | Target not active | target = a suspended user | Rejected `TARGET_NOT_ACTIVE` |
| 2.13 | Target already owner | (in a 2-owner tenant) target already Owner | Rejected `TARGET_ALREADY_OWNER` |
| 2.14 | Non-owner caller | ADMIN calls transfer | 403 (OwnerGuard) |
| 2.15 | Blank reason | reason = "" | Rejected (Critical change needs a reason) |
| 2.16 | Single-owner invariant | After 2.8, count owners | Exactly ONE active owner at all times (never 0 or 2) |

Verify (DB): `user_tenant_map.role` for both users swapped; `tenant_identity.owner_user_id` = OWNER2;
tenant-DB Owner **system role** row moved (so owner-bypass follows); one `OwnerTransfer` audit row
carrying the reason. If you ever see admin-DB says one owner but tenant-DB says another, grep server
logs for `OWNER_TRANSFER_PARTIAL_FAILURE`.

FE: transfer lives in a **danger zone**, hidden from non-owners; irreversible AlertDialog confirm;
Cancel disabled while pending; localized error (ar + en), never raw English.

---

## VIEW 3 — Members: RBAC gates + branch scope + invite token hashing (`9a4a1104`, mig 0159)

### RBAC route gating
| # | Case | Actor | Expected |
|---|------|-------|----------|
| 3.1 | Suspend needs the key | user without `settings.user.suspend` suspends MGR | 403 |
| 3.2 | Owner-only role changes | ADMIN (holds `settings.user.role.update`) tries to change a role | Still **403 in the service** — role changes remain Owner-only (documented ponytail; no role-hierarchy model yet) |
| 3.3 | Owner promotes/demotes | OWNER changes a member's role | Allowed; owner-only promote/demote preserved |

### DEV-190 branch scope (was fail-open)
| # | Case | Data | Expected |
|---|------|------|----------|
| 3.4 | Non-owner invite requires a branch | Invite CASHIER with **zero** branches selected | Blocked client-side AND server-side (`superRefine`); cannot submit |
| 3.5 | Invite with a branch | Invite CASHIER, branch=`Main Outlet` | Succeeds; user scoped to that branch |
| 3.6 | Branch list fails to load | Simulate branches query error in the invite dialog | Distinct error + retry (NOT the "no branches" empty state) — user is never stranded |

### Invitation token hashing
| # | Case | How | Expected |
|---|------|-----|----------|
| 3.7 | Token stored hashed | Create an invitation, then `SELECT token_hash, token_prefix FROM invitations` | Only a 64-char sha256 hash + short prefix; **no cleartext `token` column** exists |
| 3.8 | Accept-body validation | `POST /tenant/invitations/accept` with `{}` or non-string token | Clean 400 (Zod), not a 500; route is throttled |
| 3.9 | Cross-tenant IDOR | Resend/revoke an invitation id from another tenant | NotFound (tenant-scoped) |
| 3.10 | (F1 caveat) | Accepting via the invitations route | Does NOT provision membership — expected, use team invite; do not log as a bug |

---

## VIEW 4 — Roles: case-insensitive names + field-mask/scope editor (`80df2a8a`, mig 0160)

### Case-insensitive role names
| # | Case | Data | Expected |
|---|------|------|----------|
| 4.1 | Create then collide | Create `Cashier`, then create `cashier` | Second rejected with a friendly message (not a raw DB error) |
| 4.2 | Uppercase collide | Then try `CASHIER` | Rejected |
| 4.3 | Rename into collision | Rename another role to `cashier` | Rejected |
| 4.4 | Reactivate into collision | Deactivate `Cashier`, create a new active `cashier`, then reactivate the old one | Rejected with the role's real name in the message (never empty `""`) |
| 4.5 | Name freed after retire | Deactivate `Cashier`, create new `Cashier` | Allowed (unique index is active-scoped) |

Verify (DB): `\d roles` shows `roles_tenant_id_lower_name_key` unique index `WHERE is_active = true`;
the old case-sensitive `roles_tenant_id_name_key` is gone.

### Field-mask / scope editor
| # | Case | Data | Expected |
|---|------|------|----------|
| 4.6 | Registry-driven rows only | Open the role dialog; select `inventory.cost.view` and a non-sensitive permission | Scope/mask row appears ONLY for the sensitive (registry) permission |
| 4.7 | Human labels | Look at the sensitive-fields panel | Shows a translated label (e.g. "View cost"), NOT the raw `inventory.cost.view` |
| 4.8 | Persist masks | Check "hide cost" + "hide margin", save, reopen | Round-trips; `role_permissions.field_mask` = `{cost,margin}` |
| 4.9 | Server rejects bad mask | `POST /tenant/roles` with a fieldMask on a non-maskable permission, or an unknown field | 400 (validated server-side, not just client) |
| 4.10 | Scope parity | Send a non-default `scopeType` on a non-scope-eligible permission | 400 |
| 4.11 | Deselect prunes config | Set a mask on a permission, then uncheck the permission, re-check it | Old mask does NOT silently reappear |
| 4.12 | Honest UX | Read the panel notice | States masking is "rolling out / not yet enforced" (F3) — so testers know cost is NOT actually hidden yet |

---

## VIEW 5 — Approval PINs: admin reset + forgot-PIN (`8405cf5b`, no mig)

### Admin reset (clear) — `POST /tenant/approval-pin/reset {targetUserId, reason}`
| # | Case | Actor / data | Expected |
|---|------|--------------|----------|
| 5.1 | Owner/Admin resets a member | ADMIN resets MGR, reason set | 200; MGR's `user_approval_pins` row **deleted**; MGR's lockout cleared; MGR must set a new PIN next time |
| 5.2 | Reset = clear, never set | Inspect request/response | No PIN value is ever supplied by the resetter (SoD — admin can't approve as MGR) |
| 5.3 | Self-reset blocked | ADMIN resets ADMIN | Rejected `SELF_RESET_NOT_ALLOWED` (use the normal self PUT) |
| 5.4 | Non-owner can't reset an owner | ADMIN resets OWNER | Rejected `CANNOT_RESET_OWNER` |
| 5.5 | Owner can reset an owner | OWNER resets OWNER2 | Allowed |
| 5.6 | Missing permission | CASHIER (no `settings.approvalpin.reset`) resets MGR | 403 |
| 5.7 | Blank reason | reason = "" | Rejected; FE shows a required-reason hint |
| 5.8 | Durable audit | After 5.1, check audit | ONE row with actor + **targetUserId** + **reason** (entity id is the target, not "unknown") |
| 5.9 | Menu visibility | Look at the team user-actions menu | "Reset approval PIN" hidden for self and for inactive users |

### Forgot-PIN self-service — `POST /tenant/approval-pin/forgot {password, newPin}`
| # | Case | Data | Expected |
|---|------|------|----------|
| 5.10 | Happy self-recover | MGR, correct password `Test1234!`, newPin `2468` | 200; new PIN set; no admin involved |
| 5.11 | Wrong password | MGR, wrong password | Generic failure; repeated attempts hit a per-account lockout |
| 5.12 | Lockout countdown (own account only) | Trigger the forgot lockout | 429 with `retryAfterSeconds`; FE shows a **live localized countdown** ("try again in 4m 20s" / ar) that ticks to 0 then re-enables submit |
| 5.13 | Anti-probing unchanged | Fail a normal approval PIN (purchase/POS override) many times | Still a generic 422 with **no** lockout/remaining-time discriminator (retry-after is ONLY on your own forgot flow) |
| 5.14 | Lockout isolation | Lock out the "forgot" flow, then use a normal approval PIN | Independent counters — one flow's lockout does not lock the other |

Verify (DB): after 5.1 the `user_approval_pins` row for MGR is gone; after 5.10 a fresh row exists.
scrypt hash only — never a cleartext PIN anywhere.

---

## Cross-cutting checks (run once across all views)
- **i18n:** switch to Arabic; every new label/error/countdown renders in ar (no raw English, no em
  dashes, RTL correct). `pnpm --filter @zerupt/web i18n:check` passes.
- **Audit completeness:** every mutation in this guide produced exactly one immutable `audit_logs`
  row with the acting user; none say entity `unknown` (that was the F5 fix for PIN reset).
- **Tenant isolation:** repeat 2.x/3.x/5.x as a user of a DIFFERENT tenant — never see or affect
  Acme's data.
- **Defensive UX:** every destructive action (owner transfer, PIN reset) has a confirm; submit
  buttons disable/debounce while pending; error/empty/loading states present.

## Bug reporting
File live defects into `agent-os/product/testing/settings/_findings.md` with: view, case #, actor,
exact input data, observed vs expected, and the audit/DB row if relevant. Decide severity by the
persona (a leak/escalation = critical; a confusing message = low).
```
