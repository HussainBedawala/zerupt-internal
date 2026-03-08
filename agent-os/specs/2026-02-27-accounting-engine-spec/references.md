# References for Accounting Engine Specification

## Existing Specs

### Accounting UI Spec
- **Location:** `merpec-frontend/product/sections/accounting/spec.md`
- **Relevance:** Defines all accounting screens, user flows, and UI requirements. The engine spec defines what happens behind these screens.

### Accounting Audit
- **Location:** `agent-os/product/accounting-audit.md`
- **Relevance:** Identified 5 P0 gaps and 13 undefined business events. This spec must address every finding.

### Inventory Spec
- **Location:** `merpec-frontend/product/sections/inventory/spec.md`
- **Relevance:** Defines COGS calculation methods (WAC/FIFO), landed cost allocation, stock movements, and the accounting integration table mapping transactions to journal entries.

### POS Spec
- **Location:** `merpec-frontend/product/sections/pos/spec.md`
- **Relevance:** Defines POS sale, return, shift close, and void flows — all generate accounting events.

### Sales Spec
- **Location:** `merpec-frontend/product/sections/sales/spec.md`
- **Relevance:** Defines invoice, credit note, and receipt voucher flows.

### Purchase Spec
- **Location:** `merpec-frontend/product/sections/purchase/spec.md`
- **Relevance:** Defines PO, GRN, purchase return, and payment voucher flows.

### Settings & Admin Spec
- **Location:** `merpec-frontend/product/sections/settings-admin/spec.md`
- **Relevance:** Defines tax configuration UI, fiscal year settings, currency management, and account mapping screens.

### Data Shape
- **Location:** `merpec-frontend/product/data-shape/data-shape.md`
- **Relevance:** Entity definitions and relationships that the accounting engine must align with.

### Tech Stack
- **Location:** `agent-os/product/tech-stack.md`
- **Relevance:** NestJS EventEmitter, Prisma, PostgreSQL, modular monolith — architecture constraints.

### Product Mission
- **Location:** `agent-os/product/mission.md`
- **Relevance:** Product positioning, market targets, competitive advantages.
