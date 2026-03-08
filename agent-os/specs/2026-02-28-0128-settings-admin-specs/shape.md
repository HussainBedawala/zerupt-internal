# Settings & Admin Specification — Shaping Notes

## Scope

Build a complete `settings-admin` module spec that lets tenants adapt the ERP safely across users, permissions, branches, fiscal/tax/currency settings, numbering, notifications, integrations, and governance controls.

## Decisions

- Balanced approach: high configurability with compliance guardrails
- Hybrid source model: frontend settings capabilities inform scope, but final rules follow `agent-os/product` spec conventions
- Settings/Admin defines policy and configuration; domain modules execute transactions
- Owner has unrestricted access; all other access is assigned
- Branch-aware and tenant-isolated behavior is mandatory

## Context

- Visuals: none
- References: `agent-os/product/*` module specs and `merpec-frontend/product/sections/settings-admin/*`
- Product alignment: RBAC, auditability, localization, multi-currency, and period/tax integrity

## Standards Applied

- No `agent-os/standards` content used
- Conventions taken from existing modules (README index, numbered files, rules/tables, explicit constraints, cross-module contracts)
