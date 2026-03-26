# Compound Tax Groups

## What is compound tax?

In a compound (cascading) tax, later tax components are calculated on the base amount **plus** prior non-compound tax amounts. This differs from simple additive tax where all components apply independently to the base.

## Example: India GST with Cess

| Component | Rate | Base for calculation | Amount (on $100 base) |
|-----------|------|---------------------|----------------------|
| CGST (non-compound) | 14% | $100 | $14.00 |
| SGST (non-compound) | 14% | $100 | $14.00 |
| Cess (compound) | 12% | $100 + $14 + $14 = $128 | $15.36 |
| **Total tax** | | | **$43.36** |

Without compounding, cess would be $12.00 on the $100 base. The compound flag adds $3.36 of additional tax.

## Sort order matters

Components are evaluated in `sortOrder` sequence. A compound component only considers prior components (lower sort order) that are non-compound. This means:

- Non-compound components should always come before compound ones
- If a compound component is placed first (before any non-compound), it effectively behaves as non-compound (no prior amounts to compound on)
- The backend does not enforce ordering — the frontend validates and warns

## Inclusive + compound = rejected

The backend rejects `isCompound: true` when the tax code's type is `inclusive`. Inclusive tax means the rate is already embedded in the price. Compounding on an inclusive base is mathematically ambiguous — you cannot extract the compound relationship when working backwards from a tax-inclusive price.

## Database representation

```
tax_group_components
├── tax_group_id (FK → tax_groups)
├── tax_code_id (FK → tax_codes)
├── sort_order (smallint, determines calculation sequence)
└── is_compound (boolean, false = additive, true = cascading)
```

## Key concepts
- **Additive tax**: all components apply to the same base (most VAT systems)
- **Compound/cascading tax**: later components apply to base + prior tax (India Cess, some Canadian provinces)
- **Sort order**: determines which components are "prior" for compound calculation
- **Inclusive guard**: compound + inclusive combination is mathematically undefined and rejected
