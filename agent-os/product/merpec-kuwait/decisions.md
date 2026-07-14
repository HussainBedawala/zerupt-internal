<!-- Merpec Kuwait white-label program | Decision record | Created: 2026-07-11 -->
# Merpec Kuwait: Decisions Record

**What this document is:** the agreed plan for selling Zerupt in Kuwait under the Merpec brand name. Written in plain language so anyone (technical or not) can read it. The deep technical spec will live separately in `engineering/` once written.

**Status:** decided, not yet built.

---

## 1. The situation

- Zerupt is our new ERP, sold internationally (India, Middle East, Southeast Asia) at `app.zerupt.com`.
- Merpec is Dad's ERP, sold in Kuwait for 12 years. It has a strong name there, but it is built on old technology (.NET MVC, Microsoft SQL Server, GoDaddy servers) that is hard to maintain.
- Merpec has two kinds of customers today: standard ones (they use `erp.merpec.com`) and customized ones (each has their own address, like `kb.merpec.com`).

**The goal:** new customers in Kuwait should get Zerupt, but everything they see should say "Merpec". Same product under the hood, different name and look on the outside.

## 2. The core decision (the one rule that must never break)

**There is exactly ONE codebase and ONE backend. Merpec is a "skin", not a copy.**

We will never copy the code to make a Merpec version. Copies are how the old Merpec business ended up with many separate customized systems that are hard to update. Instead:

- The code stays in one place (the existing Zerupt repo).
- A small "brand config" file holds each brand's name, logo, colors, and email sender. The app is built twice from the same code: once as Zerupt, once as Merpec.
- Kuwait customers use `app.merpeckw.com` (the `merpec.com` domain belongs to the old system at GoDaddy; new Merpec runs on our Namecheap-registered `merpeckw.com`). International customers use `app.zerupt.com`. Both talk to the same backend server and the same database platform.

## 3. What stays the same, what changes

| Piece | Merpec Kuwait | Notes |
|---|---|---|
| Code | Same repo, same code | One team, one place to fix bugs |
| Backend API (Railway) | Same server, answers to `api.merpeckw.com` too | Adding a second web address to the same server is cheap and easy |
| Databases (Neon) | Same setup: every customer gets their own private database | A Merpec customer's data is just as isolated as a Zerupt customer's |
| Login system (Supabase) | Same system | Login emails will be Merpec-branded (see section 7) |
| Frontend (Vercel) | A second deployment of the same code with `BRAND=merpec` | Shows Merpec logo, name, colors everywhere |
| Admin view | Same admin panel; every customer record gets a `brand` field (zerupt or merpec) | So we can see and filter Kuwait customers separately |
| Old Merpec system | Untouched | Existing customers stay where they are for now |

## 4. Work needed before the first Merpec customer

1. **Brand config + string sweep** (1-2 days): make every place that currently says "Zerupt" (logo, app name, browser tab, receipt footers, printed documents) read from the brand config instead.
2. **Second frontend deployment** (1 day): new Vercel project at `app.merpeckw.com` (DONE 2026-07-14: deployed, DNS on Vercel nameservers, wildcard `*.merpeckw.com` live), Merpec logo and colors from Dad.
3. **Brand-aware emails** (1-2 days): login and product emails come from a Merpec address for Merpec customers (see section 7).
4. **Safety net** (same week): nightly backups of every customer database to a second storage provider, plus turning on Neon's longest restore window. See section 9.
5. **Anti-leak check**: an automated test that fails if the word "Zerupt" ever appears anywhere in the Merpec build. This blocks brand mistakes before they ship.

Then: first pilot customer in Kuwait, ideally a friendly business Dad knows well.

## 5. Customizations (garage module, custom invoices, etc.)

Kuwaiti customers often pay for custom features. The old way was to make a custom copy of the system for them. The new way has three levels:

1. **Settings, not code (aim for 80% here):** custom invoice layouts, print styles, extra fields, and report tweaks should be things a customer (or we) can configure inside the product. Costs almost nothing per customer once built.
2. **Optional modules behind a switch:** bigger things (like the garage module for the auto-parts customer) get built INTO the main product, but hidden behind a per-customer switch called an "entitlement". Only customers who paid for it see it. Bonus: that module can later be sold to similar businesses in other countries. Every paid customization becomes a product we own, instead of a one-off copy we must maintain.
3. **Truly one-off requests:** still built in the main codebase behind that customer's switch. If a request genuinely cannot work that way, we say no or reshape it. **We never fork the code. No exceptions.**

**Custom web addresses:** if a customer pays for their own address (like `alghanim.merpeckw.com` or `erp.theircompany.com`), it is about 30 minutes of setup: point their address at our frontend, add it to two allow-lists. Same product, no new code. We can charge well for this.

## 6. Money: how Merpec customers pay, and what it costs us

**How customers pay:** the Merpec way. A one-time implementation fee (varies by customer) plus a yearly maintenance fee (AMC, typically around 120 KWD/year). No payment gateway needed; invoices are sent manually like Dad does today. The system just records the custom yearly deal on the customer's subscription record (small backend change needed to allow custom yearly pricing).

**What it costs us to run (verified prices, July 2026):** fixed platform fees are about $65-90/month total (Vercel $20, Railway $20+, Supabase $25, backups a few dollars). On top of that, the database cost is SHARED: all customers ride one database compute engine, billed by how hard it works, not per customer. Rough totals for both brands combined:

| Customers | Total infra / month | Per customer |
|---|---|---|
| 0-5 (now) | ~$52-122 | - |
| 25 | ~$98-168 | ~$4-7 |
| 100 | ~$160-240 | ~$1.60-2.40 |
| 1,000 | ~$870-1,390 | ~$0.90-1.40 |

A 120 KWD/year AMC is about $32.50/month of revenue against $1-5/month of cost: **90%+ margin**, with implementation fees on top. The cost per customer goes DOWN as we grow. Dad's current $200/month GoDaddy bill would roughly cover both brands up to ~100+ customers, with far better safety.

**Adding Merpec itself costs almost nothing:** roughly $0-25/month of extra platform overhead before customers (second Vercel project is free on our plan, same API server, same login system; a second email domain costs $20/month when we start sending real volume).

## 7. Emails

Two kinds of email, both end up sent through Resend (our email service):

1. **Login emails** (confirm account, reset password): triggered by Supabase but routed through our own sender, so Merpec customers get them from `Merpec <no-reply@mail.merpeckw.com>` with a Merpec template.
2. **Product emails** (notifications, receipts): sent by our app; the sender and template are picked by the customer's brand.

DONE: `mail.merpeckw.com` is verified in Resend (DKIM/SPF live on Vercel DNS).

## 8. Existing Merpec customers and the old system

- **Not touched now.** They stay on the old system at their current addresses.
- **No migration offers** until new-Merpec-on-Zerupt has run successfully with several new customers for several months, AND we have a written list of what old Merpec can do that Zerupt cannot yet.
- **Long term:** migrate them and retire the old system. The tool we will build to import their Microsoft SQL Server data is the same "migrate from legacy ERP" engine that is our sales wedge internationally, so this work is core product, not a side project.

## 9. Protecting customer data (the 20-year promise)

The rule: **no single company ever holds the only copy of a customer's data.**

- Every customer already has their own private database (Neon), with point-in-time restore (we can rewind a database to any minute within the retention window).
- We will add nightly exports of every customer database to Cloudflare R2 storage, and a second copy to another provider. These exports are plain, portable database files that can be restored anywhere, even if Neon disappeared.
- Every few months we practice restoring a backup, because an untested backup is a hope, not a backup.
- Open action item: set Neon's restore retention and branch protection (already on the founder to-do list).

## 10. Known risks and how we handle them

| Risk | What could happen | Our answer |
|---|---|---|
| Shared backend | A bad code release breaks Kuwait AND international at the same time | No deploys during Gulf business hours; automated checks before release; once Merpec has ~10 paying customers, give it its own deployment that gets releases only after they have proven stable internationally |
| Brand leak | "Zerupt" shows up in a Merpec invoice or email | The automated anti-leak test (section 4, item 5) blocks it before shipping |
| Customization temptation | A big fee tempts us into a "quick copy just for them", killing the one-codebase rule | Founder policy, written here: never fork. Level 1/2/3 in section 5 are the only options |
| Old customers ask to switch too early | A failed early migration damages Merpec's 12-year reputation | Hard rule in section 8: no migrations until proof, with a written feature-gap list |
| Database growing pains | Hundreds of customers share one database engine; one heavy customer can slow others | Each customer's record already stores which engine hosts them, so heavy or premium customers can be moved to their own engine later. Check load monthly from ~150 customers |
| Speed for Kuwait users | Our servers have no Middle East region yet (Railway runs its own data centers: US, Amsterdam, Singapore) | Verify which regions our API and database sit in before launch; Amsterdam is acceptable (~120ms). Re-check Railway's regions near launch |
| Surprise bills | Database compute or AI usage grows quietly | Billing alerts on all platforms; cap the database engine's maximum size |
| Everything depends on Hussain | One person understands the whole system | Keep a runbook: where everything lives, how to restore a backup, how to rotate a secret |

## 11. Open questions (not blockers)

1. Which Railway region and Neon region are we in today? (Affects Kuwait speed.)
2. Which legal entity contracts with Kuwaiti customers: Malakstar (India) or Dad's Kuwaiti establishment? (Needed for the Merpec terms of service.)
3. Will Dad's developers eventually work on this codebase? (Extra seats ~$20/month each, plus onboarding docs.)
4. Do usable Merpec brand assets exist (logo as SVG, colors), or does Merpec's visual identity get a refresh as part of this?

## 12. What happens next

1. Write the technical spec (will live in `agent-os/engineering/`), turning sections 4, 5, and 7 into exact file-level tasks.
2. Execute the build steps in section 4.
3. Land the first pilot customer in Kuwait.
