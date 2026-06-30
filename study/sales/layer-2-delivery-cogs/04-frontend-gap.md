# Sales Layer 2 — Frontend Delivery/Fulfillment UI

## What Exists

- Invoice list: `apps/web/src/app/[locale]/(app)/sales/invoices/page.tsx`
- Invoice detail: `apps/web/src/app/[locale]/(app)/sales/invoices/[id]/page.tsx`
- Invoice create: `apps/web/src/app/[locale]/(app)/sales/invoices/new/page.tsx`
- Direct sale panel: `apps/web/src/features/sales/components/direct/direct-sale-panel.tsx`
- Sales Orders: `apps/web/src/app/[locale]/(app)/sales/orders/`

## What Does NOT Exist

- No delivery/fulfillment/dispatch UI or page
- No picking list or pick-confirm UI
- No warehouse picker on the confirm dialog (warehouseId is on the LINE, set at add-line time)
- No partial fulfillment UI (cannot ship some lines and hold others)
- No serial-number selection UI on the sales invoice form (serial selection exists in code at add-line, unclear if web form exposes it)
- No delivery order or DO numbering

## Assessment

The frontend exactly mirrors the backend design: stock relieves at invoice confirm, which is a single button. This is appropriate for the MVP/retail MENA use case (over-the-counter sales). For B2B/SO-driven workflows where physical delivery precedes billing, this creates a gap.
