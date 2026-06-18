# Kuwait E2E Test Customers

Three throwaway-tenant personas for full end-to-end shakedown of Zerupt, country **Kuwait (KWD)**.
Generated 2026-06-15. Run on the **live/prod** DB first (founder), log issues back into
`erp/docs/e2e-issues-log.md`.

| # | Business | Size | Locations | Users | Items | Customers | Suppliers | Folder |
|---|----------|------|-----------|-------|-------|-----------|-----------|--------|
| 1 | Al-Asala Auto Parts | Simple | 1 | 1–2 | 150 | 4 | 2 | [persona-1-asala-autoparts](persona-1-asala-autoparts) |
| 2 | Layla Cosmetics | Medium | 3 | 6–8 | 780 | 12 | 3 | [persona-2-layla-cosmetics](persona-2-layla-cosmetics) |
| 3 | Gulf Hardware & Tools Co. | Large | 5 + WH | 20–30 | 8,500 | 4,200 | 180 | [persona-3-gulf-hardware](persona-3-gulf-hardware) |

- **Per-customer requirements:** each persona folder has a `README.md` that reads like a real
  customer requirements-gathering intake (business profile to go-live), at the depth of its tier.
- **Test plan + scripts:** [e2e-test-plan-kuwait.md](e2e-test-plan-kuwait.md)
- **Images** (shared, all valid PNG/SVG, <2 MB): [images/](images) — products, avatars, logos.
- **Regenerate any time:** `python3 _generate.py` (writes into `kuwait/`; each persona re-seeds
  for stable, independent output — P1 seed 42, P2 seed 202, P3 seed 303).

## Image formats Zerupt accepts (cheat-sheet)
| Upload | Formats | Max | On receipt? |
|--------|---------|-----|-------------|
| Product image | PNG, JPEG, WebP | 2 MB | No (catalog only) |
| Customer image | PNG, JPEG, WebP | 2 MB | No |
| Business logo | PNG, JPEG, WebP, **SVG** | 2 MB | **Yes** (top of receipt) |

## Files carry deliberate mess (the AI-first pipeline is the product)
Mixed AR/EN text, locale number formats (`1.234,56` vs `1,234.56`), Arabic-Indic digits (`٥٠٠`),
currency suffixes (`800.82 KWD`), blank/`-` cells, multi-warehouse columns, and a deliberately
**unbalanced** trial balance on Persona 2 (tests the OBE plug). Clean paths prove nothing; the mess
is the test.

**Per-tier mess (by design):**
- **P1 Al-Asala** — none. The clean control / happy path.
- **P2 Layla** — inconsistent category spellings (`Skincare`/`Skin Care`/`skincare`), a few blank
  costs, a duplicate SKU (`LC-00008`), expiry tracked only sometimes, unbalanced TB → OBE plug.
- **P3 Gulf** — messy AR formats at scale, `Wholesale Price` + retail tiers, `Salesman` + `Payment
  Terms` columns, plus B2B subledgers: `pdc_register.csv` (post-dated cheques) and
  `open_quotations.csv` (quote → order → delivery flow). xlsx for items + TB.
