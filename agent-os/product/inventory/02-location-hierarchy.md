# Location Hierarchy

## Structure

```
Tenant
└── Branch (physical store location)
    └── Warehouse (storage area)
        └── Zone (logical area within warehouse)
            └── Bin (exact position: aisle, shelf, slot)
```

## Entities

### Branch

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `name` | string | |
| `address` | object | Full address |
| `currencyCode` | string | Can differ from tenant's functional currency |
| `isActive` | boolean | |

### Warehouse

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `branchId` | string | |
| `name` | string | e.g., "Main Floor", "Backroom", "Off-Site Storage" |
| `type` | enum | `Store`, `Warehouse`, `Transit` |
| `isDefault` | boolean | Default warehouse for this branch (POS uses this) |
| `isActive` | boolean | |

Each branch must have at least one warehouse. The `Transit` type is a system warehouse for inter-branch transfers.

### Zone

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `warehouseId` | string | |
| `name` | string | "Receiving", "Storage", "Picking", "Shipping" |
| `sortOrder` | integer | |

Optional. Small retailers skip zones entirely.

### Bin

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `zoneId` | string | null if no zones used |
| `warehouseId` | string | |
| `code` | string | e.g., "A-03-B" (Aisle A, Shelf 3, Position B) |
| `isActive` | boolean | |

Optional. Small retailers skip bins entirely.

## Stock Tracking Granularity

Stock is tracked at the **most granular level available**:

| Setup | Stock Tracked At |
|-------|-----------------|
| Branch + Warehouse + Zone + Bin | Bin level |
| Branch + Warehouse + Zone (no bins) | Zone level |
| Branch + Warehouse (no zones/bins) | Warehouse level |
| Branch only (one default warehouse) | Warehouse level (auto-created) |

## Querying Stock

Stock at any level = sum of stock at all child levels.

```
Stock at Branch    = sum of all Warehouses in that Branch
Stock at Warehouse = sum of all Zones (or direct if no zones)
Stock at Zone      = sum of all Bins (or direct if no bins)
Stock at Company   = sum of all Branches
```

## Default Setup (New Tenant)

On tenant creation:
1. One Branch created (from onboarding company address)
2. One Warehouse auto-created as default for that Branch
3. No Zones or Bins (retailer adds if needed)

## Rules

| Rule | Detail |
|------|--------|
| Branch cannot be deleted | Only deactivated. Must have zero stock first. |
| Warehouse cannot be deleted | Only deactivated. Must have zero stock first. |
| Inter-branch transfer | Requires two-step (send → receive) with transit warehouse |
| Same-branch transfer | Can be instant (warehouse to warehouse within same branch) |
| POS location | POS always operates from a branch's default warehouse |
