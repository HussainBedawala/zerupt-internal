# Stock Movements

Every movement type, what it does, and its side effects.

---

## GRN Receipt

**Trigger:** Purchase module confirms a Goods Receiving Note.

| Step | Action |
|------|--------|
| 1 | Create stock ledger entry: `GRN_RECEIPT`, +quantity, at purchase unit cost |
| 2 | Update stock level snapshot: increase onHand |
| 3 | Recalculate WAC (or create FIFO cost layer) |
| 4 | If serial-tracked: create serial number records (one per unit, status = `InStock`) |
| 5 | If batch-tracked: create or update batch record (link to this GRN) |
| 6 | Emit `purchase.grn.confirmed` → accounting engine creates journal entry |
| 7 | Decrease onOrder quantity (by received qty from the PO) |

**Partial receipt:** Only the received quantity is processed. Remainder stays as onOrder.

---

## Sale (Invoice or POS)

**Trigger:** Sales invoice confirmed or POS transaction completed.

| Step | Action |
|------|--------|
| 1 | Validate stock availability (see `10-negative-stock.md`) |
| 2 | Create stock ledger entry: `SALE`, -quantity, at current WAC or FIFO cost |
| 3 | Update stock level snapshot: decrease onHand |
| 4 | If serial-tracked: update serial status to `Sold`, link to sale document |
| 5 | If batch-tracked: consume from oldest batch (FIFO) |
| 6 | Emit `sales.invoice.confirmed` or `pos.transaction.completed` → accounting |

**Which warehouse?** Sales invoice: specified on the document. POS: branch's default warehouse.

---

## Sale Return (Credit Note or POS Return)

**Trigger:** Credit note confirmed or POS return completed.

| Step | Action |
|------|--------|
| 1 | Create stock ledger entry: `SALE_RETURN`, +quantity, at return cost |
| 2 | Update stock level snapshot: increase onHand |
| 3 | Recalculate WAC (return cost enters the pool) |
| 4 | If serial-tracked: update serial status back to `InStock` |
| 5 | If batch-tracked: restore to original batch |
| 6 | Emit accounting event for revenue and COGS reversal |

**Return cost:**
- WAC items: current WAC at time of return
- FIFO items: original cost layer if identifiable, else most recent cost

---

## Stock Adjustment

**Trigger:** User creates and submits (or manager approves) an adjustment.

| Field | Description |
|-------|-------------|
| `type` | `Damaged`, `Lost`, `Found`, `CountDiscrepancy`, `WriteOff`, `Other` |
| `items` | Array of `{ itemId, warehouseId, binId, quantity, cost, notes }` |
| `reason` | Required text |
| `approvedBy` | Manager who approved (if above threshold) |

| Step | Action |
|------|--------|
| 1 | Check approval: if total value > threshold, require manager approval |
| 2 | Create stock ledger entry: `ADJUSTMENT_IN` or `ADJUSTMENT_OUT` |
| 3 | Update stock level snapshot |
| 4 | If increase with no cost specified: use current WAC |
| 5 | Recalculate WAC (if increase with a different cost) |
| 6 | Emit `inventory.adjustment.posted` → accounting |

---

## Stock Transfer

### Instant Transfer (Same Branch)

**Trigger:** User transfers stock between warehouses in the same branch.

| Step | Action |
|------|--------|
| 1 | Validate source has sufficient stock |
| 2 | Create ledger entry: `TRANSFER_OUT` at source, -quantity |
| 3 | Create ledger entry: `TRANSFER_IN` at destination, +quantity |
| 4 | Both at same cost (WAC or FIFO layer cost) |
| 5 | Update both stock level snapshots |
| 6 | If serial-tracked: update serial location |

No accounting entry if same inventory account. Entry needed if different branches use different accounts.

### Two-Step Transfer (Inter-Branch)

**Send step:**

| Step | Action |
|------|--------|
| 1 | Create ledger entry: `TRANSFER_OUT` at source, -quantity |
| 2 | Update source stock level: decrease onHand |
| 3 | Update destination stock level: increase inTransit |
| 4 | Transfer status = `InTransit` |
| 5 | Emit accounting event: DR Inventory in Transit / CR Inventory |

**Receive step:**

| Step | Action |
|------|--------|
| 1 | Create ledger entry: `TRANSFER_IN` at destination, +quantity received |
| 2 | Update destination stock level: decrease inTransit, increase onHand |
| 3 | Transfer status = `Completed` (or `PartiallyReceived` if partial) |
| 4 | Emit accounting event: DR Inventory / CR Inventory in Transit |

**Partial receive:** Only received qty processed. Remainder stays inTransit.

**Discrepancy (missing items):**

| Step | Action |
|------|--------|
| 1 | Received qty < sent qty |
| 2 | Missing qty: create `ADJUSTMENT_OUT` ledger entry from transit |
| 3 | Emit accounting event for write-down of missing items |

---

## Internal Consumption

**Trigger:** User records items consumed internally.

| Step | Action |
|------|--------|
| 1 | Create ledger entry: `CONSUMPTION`, -quantity, at current cost |
| 2 | Update stock level |
| 3 | Emit `inventory.consumption.posted` → accounting (expense account) |

---

## Assembly

**Trigger:** User produces finished goods from components (BOM).

**Assemble:**

| Step | Action |
|------|--------|
| 1 | Validate all components have sufficient stock |
| 2 | For each component: create `ASSEMBLY_OUT` ledger entry, -component qty |
| 3 | Calculate finished goods cost = sum of component costs |
| 4 | Create `ASSEMBLY_IN` ledger entry for finished good, +produced qty, at calculated cost |
| 5 | Recalculate finished good WAC |
| 6 | If scrap: deduct scrap qty from components, add to production cost account |
| 7 | Emit `inventory.assembly.completed` → accounting |

**Disassemble (reverse):**

| Step | Action |
|------|--------|
| 1 | Create `DISASSEMBLY_OUT` for finished good, -qty |
| 2 | For each component: create `DISASSEMBLY_IN`, +component qty |
| 3 | Component costs allocated proportionally from finished good cost |
| 4 | Emit `inventory.disassembly.completed` → accounting |

---

## Purchase Return

**Trigger:** Purchase module confirms a return to supplier.

| Step | Action |
|------|--------|
| 1 | Create ledger entry: `PURCHASE_RETURN`, -quantity, at cost |
| 2 | Update stock level |
| 3 | Recalculate WAC |
| 4 | If serial-tracked: update serial status to `Returned` |
| 5 | Emit `purchase.return.confirmed` → accounting |

---

## Document Numbering

Each movement document type has its own sequential numbering:

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Stock Adjustment | `ADJ-` | `ADJ-0001` |
| Stock Transfer | `TRF-` | `TRF-0001` |
| Consumption | `CON-` | `CON-0001` |
| Assembly | `ASM-` | `ASM-0001` |
| Stock Count | `CNT-` | `CNT-0001` |

Sequential, no gaps. Prefix configurable per tenant.
