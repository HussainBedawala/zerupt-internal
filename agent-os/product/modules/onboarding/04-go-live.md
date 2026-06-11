# Go-Live

## Overview

The final onboarding step. Ensures the tenant is ready for production use, sends team invitations, and activates the Onboarding Coach agent.

---

## Go-Live Checklist

Before the "Go Live" button is enabled, the system verifies:

| Check | Required | Condition |
|-------|----------|-----------|
| Configuration pipeline complete | Yes | All 10 pipeline steps succeeded |
| At least one branch exists | Yes | Branch entity count > 0 |
| COA seeded or custom accounts created | Yes | Account count > 0 |
| Tax profile configured | Yes | Tax profile entity exists |
| Fiscal period created | Yes | At least one fiscal period with status `Open` |
| At least one role created | Yes | Role entity count > 0 (Owner always exists) |
| Data imports complete (if selected) | No | If Step 7 indicated data to import, check import jobs are `Applied` or user explicitly skipped |
| Opening balances balanced | No | If opening balance import was done, verify OBE (3900) impact is acknowledged |

Items marked "No" for required show as warnings, not blockers. The user can proceed with warnings.

## Team Invitation Sending

If team members were entered in questionnaire Step 5:

1. On go-live confirmation, all queued `Invitation` entities are sent via email.
2. Each invitation includes: tenant name, role assignment, branch assignment, and a signup/login link.
3. Invitations expire after 7 days. The owner can resend from Settings > Users.
4. Invited users who sign up are automatically assigned the specified role and branch.

## First-Login Experience

After go-live, the owner lands on the configured dashboard (not the onboarding wizard). The dashboard includes:

| Element | Description |
|---------|-------------|
| Welcome banner | "Your system is ready! Here's what to try first." Dismissable. |
| Quick-start checklist | "Create your first invoice", "Open the POS", "Check your dashboard", "Invite more team members" |
| Copilot prompt | "Have questions? Ask the assistant anything." with a link to open the Copilot panel |
| Video walkthrough | Optional 2-minute overview video (embedded or linked) |

The quick-start checklist tracks completion per item and auto-dismisses when all items are done or after 7 days.

## Onboarding Coach Activation

On go-live:

1. The Onboarding Coach agent (`agents/06-onboarding-coach.md`) is activated for the tenant.
2. It begins tracking feature adoption, configuration completeness, and data completeness.
3. First suggestions appear the morning after go-live (not immediately — avoid overwhelming).
4. Auto-deactivates after 60 days or when adoption score reaches 80%.

## Tenant State Transition

| Field | Value After Go-Live |
|-------|---------------------|
| `tenant.onboardingCompletedAt` | Set to current datetime |
| `tenant.onboardingState` | Frozen (read-only). Retained for audit and analytics. |
| `tenant.status` | Remains `Active` (was already Active since signup) |

## Success Metrics

| Metric | Target |
|--------|--------|
| Time from signup to go-live | < 2 hours (with data import), < 30 minutes (without) |
| Questionnaire completion rate | > 90% of started questionnaires |
| Configuration pipeline success rate | > 99% |
| Data import completion rate | > 80% of users who selected "yes" to data import |

## Permissions

| Action | Required Key |
|--------|--------------|
| Complete go-live | `tenant.onboarding.goLive` (owner-only by default) |
| Send team invitations | `tenant.onboarding.goLive` |
| Dismiss welcome banner | Any authenticated user |

## Cross-Module Contracts

| Contract | Target |
|----------|--------|
| Go-live → Onboarding Coach | `agents/06-onboarding-coach.md` activates |
| Go-live → Dashboard | `dashboard/07-role-based-defaults.md` widgets become visible |
| Go-live → Notifications | Default notification policies from `settings-admin/08-notifications-alert-policy.md` are active |
