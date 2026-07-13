# 04 — Brand-Aware Email

Two streams; both ultimately send via Resend. Rule: a Merpec tenant's users never receive an email that says Zerupt or comes from a zerupt.com address.

## Stream 1 — product emails (sent by our API)

Today: single global `RESEND_FROM` env (`Zee at Zerupt <zee@mail.zerupt.com>`), one mailer path.

Change: the mailer resolves the tenant's brand (from the tenant record, cached — see 02) and picks `emailFrom` + template header/footer from the brand config. Env becomes per-brand (`RESEND_FROM_ZERUPT`, `RESEND_FROM_MERPEC`) or a single JSON map; fail loud at startup if a configured brand lacks a sender.

Templates: shared layout component parameterized by brand (logo URL, name, footer address). Do not duplicate template files per brand.

## Stream 2 — auth emails (triggered by Supabase)

Supabase's built-in templates are per-project and can't vary by brand. Use the **Supabase Send Email Hook**: point the project's email hook at an API endpoint; on each auth email event, the endpoint looks up the user's tenant → brand, renders the brand-correct template (confirm signup / reset password / magic link), and sends via Resend.

Details:
- Hook endpoint must verify the Supabase webhook signature and be idempotent.
- New user at signup may not have a tenant yet — resolve brand from the signup origin (the redirect URL/domain in the auth request) as fallback; default deny-to-neutral template if genuinely unknown (neutral = no brand name rather than wrong brand).
- Redirect URLs inside these emails must target the correct domain (`app.merpec.com/...` for Merpec users) — derive from the same brand resolution.
- Supabase Pro ($25/mo) is required anyway for MAU headroom; hook removes Supabase's own sending entirely.

## Resend setup

- Verify `mail.merpec.com` as a second domain (DKIM/SPF records in the merpec.com DNS zone). Second domain requires Resend Pro ($20/mo, 10 domains) — free tier (1 domain, 3k emails/mo) is fine until Merpec actually sends.
- Sender identities: `Merpec <no-reply@mail.merpec.com>`; decide a human-reply address (e.g. `support@merpec.com`) with Dad.

## Test matrix (must pass before first Merpec customer)

| Case | Expect |
|---|---|
| Merpec user password reset | Merpec sender, Merpec template, link to app.merpec.com |
| Zerupt user password reset | unchanged from today |
| Merpec tenant notification/receipt email | Merpec sender + footer |
| Signup confirmation from app.merpec.com before tenant exists | Merpec (origin-derived) |
