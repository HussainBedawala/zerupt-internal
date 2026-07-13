# Onboarding — Team & Roles (RBAC) Testing Checklist

> Persona: **a UAE shop owner adding their staff.** They think in job titles (cashier, store manager, accountant), not permissions. The critical rule for this persona: cashiers and salesmen must never see cost prices or margins, and branch staff should be scoped to their branch. Getting RBAC wrong leaks sensitive cost/margin data to counter staff.

- **Route(s):** `/[locale]/(app)/onboarding` step 5
- **Feature dir:** `apps/web/src/features/onboarding/components/steps/step5-team.tsx`; post-onboarding: `apps/web/src/features/roles/`, `apps/web/src/features/team/`
- **API:** `apps/api/src/roles/` (role CRUD, permission sets), `apps/api/src/team-users/` (invite/assign)
- **Depends on:** 00 (Owner seeded), 02 (branches exist for branch scoping)

## 0. Preconditions

- [ ] Owner role already assigned to the creator (from provisioning).
- [ ] Branches created (step 2) so branch-scoped roles can be assigned.
- [ ] Persona: **P1** = owner + 1 cashier (cashier hides cost/reports); **P2** = owner + 3 store managers + 2-4 cashiers (per-branch scope); **P3** = 20-30 users across GM, store/warehouse managers, accountant, salesmen, cashiers, pickers.

## 1. Functional — actions & states

- [ ] **Invite a user** by email and assign a role; the invite is created and the user appears in the team list as pending.
  - [ ] Loading/error states; error preserves the entered email and role.
  - [ ] Empty state (only the owner so far) is clear.
  - [ ] Duplicate invite to the same email is prevented or clearly handled.
- [ ] Assign a role scoped to a specific branch (P2/P3) where applicable.
- [ ] Role templates (cashier, store manager, accountant, etc.) are available and describe what they grant.

## 2. Domain invariants

- [ ] The **Owner** is a system role that bypasses granular permission checks; exactly the creator holds it initially.
- [ ] A **cashier** role cannot see cost prices, margins, or accounting reports (enforced server-side, not just hidden in the UI). Verify by logging in as a cashier and confirming the cost fields/endpoints are denied.
- [ ] Branch-scoped roles (P2/P3) restrict the user to their assigned branch's data (POS, stock visibility); they cannot read another branch's data.
- [ ] Permission checks are enforced on the server for every gated action; hiding a button in the UI is never the only guard.
- [ ] Owner-only onboarding endpoints reject non-owners (a store manager cannot start/configure/complete onboarding).

## 3. Edge cases & defensive UX — "the dumbest thing a user could do"

- [ ] Inviting a user with an invalid email is rejected client and server side.
- [ ] Removing/downgrading the last Owner is prevented (the tenant must always have an owner).
- [ ] A cashier attempting to reach a cost/report endpoint directly (URL or API) is denied server-side.
- [ ] Rapid re-invite / double-submit does not create duplicate users or duplicate invites.
- [ ] A pending (unaccepted) invite cannot access tenant data.
- [ ] RTL/LTR render; role and permission names display in AR/EN.

## 4. Cross-module / integration

- [ ] Roles assigned here govern access across POS (cashier scope), inventory (cost visibility), accounting (reports), and reports; verify the cost-hiding rule holds in POS and inventory, not just here.
- [ ] Branch scope set here matches the branches from step 2 and the cashier login scope used in POS.

## 5. Known gaps (from recon — verify or track)

- Verify time-based / working-hours access restrictions are out of scope for these personas (P1 explicitly needs none); do not treat their absence as a defect.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
</content>
