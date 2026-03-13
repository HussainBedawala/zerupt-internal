# Application Shell

## Overview

Zerupt uses an icon rail + flyout sidebar pattern. A narrow vertical rail of icons (64px) sits on the left edge. Hovering or clicking an icon expands a flyout panel with the full label and any sub-navigation. The content area takes the remaining width, maximizing space for data-dense views like POS, accounting tables, and report builders.

## Components

### `AppShell`

The top-level layout wrapper. Renders the desktop sidebar and mobile top bar/drawer, and provides the scrollable content area via `children`.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `React.ReactNode` | required | Page content rendered in the main area |
| `navigationItems` | `NavItem[]` | `defaultNavItems` | Navigation items to display |
| `activeNavId` | `string` | `'dashboard'` | ID of the currently active nav item |
| `user` | `{ name, email?, avatarUrl? }` | — | Logged-in user info |
| `onNavigate` | `(href: string) => void` | — | Called when a nav link is clicked |
| `onLogout` | `() => void` | — | Called when logout is triggered |
| `onToggleLanguage` | `() => void` | — | Called when language toggle is clicked |
| `onToggleTheme` | `() => void` | — | Called when theme toggle is clicked |
| `currentLanguage` | `'en' \| 'ar'` | `'en'` | Current UI language |
| `currentTheme` | `'light' \| 'dark'` | `'light'` | Current theme |

### `MainNav`

The desktop sidebar. Collapses to a 64px icon rail when not hovered; expands to 200px showing labels on hover. Items with children show an inline sub-list when expanded, or a flyout panel when collapsed.

### `UserMenu`

A circular avatar button pinned to the bottom of the sidebar (and the top-right on mobile). Clicking opens a dropdown with user name, email, language toggle, theme toggle, and logout.

### `defaultNavItems`

Pre-configured navigation items covering all Zerupt sections:

- Dashboard
- POS
- Sales (Quotations, Sales Orders, Invoices, Credit Notes, Customers, and purchasing sub-items)
- Inventory (Items, Warehouses, Stock Transfers, Adjustments, Serial Numbers)
- Accounting (Chart of Accounts, Journal Entries, Cheques, Receipt/Payment Vouchers, Financial Statements, VAT Returns)
- Reports (Report Builder, Saved Reports)
- Settings (Organisation, Taxation, Locations, Team, Roles, Currencies, Price Lists, Notifications, Audit Trail, Data Import, Integrations, Appearance)

## Layout Pattern

- **Icon rail**: 64px wide, fixed left, full height. Section icons vertically centered, user menu pinned to bottom.
- **Flyout/expanded panel**: 200px wide, expands on hover. Shows section label and sub-navigation links inline. A flyout panel (200px, `bg-zinc-900`) appears to the right of the icon rail when the rail is collapsed and an item with children is active.
- **Content area**: Fills remaining width. Sections render here with their own internal layout.

## Responsive Behavior

- **Desktop (≥768px):** Icon rail visible, expands on hover, flyout sub-navigation available.
- **Mobile (<768px):** Icon rail hidden. A 56px top bar shows the logo and user menu. A hamburger button opens a full-width 288px drawer (`w-72`) with all navigation items and their children expanded.

## Design Tokens

- **Rail background**: `bg-zinc-950`
- **Active item**: `bg-violet-600 text-white shadow-md shadow-violet-600/25`
- **Inactive item**: `text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60`
- **Sub-navigation active**: `text-violet-400 bg-violet-600/10`
- **Flyout panel**: `bg-zinc-900 border-r border-zinc-800 shadow-xl`
- **Transition**: `duration-200 ease-out` (sidebar width), `duration-150` (item state)
- **Font**: IBM Plex Sans

## Usage

```tsx
import { AppShell, defaultNavItems } from './shell/components'

function App() {
  return (
    <AppShell
      navigationItems={defaultNavItems}
      activeNavId="dashboard"
      user={{ name: 'Jane Doe', email: 'jane@company.com' }}
      onNavigate={(href) => router.push(href)}
      onLogout={() => auth.logout()}
      onToggleLanguage={() => i18n.toggle()}
      onToggleTheme={() => theme.toggle()}
      currentLanguage="en"
      currentTheme="light"
    >
      <YourPageContent />
    </AppShell>
  )
}
```

## Dependencies

- `react` (useState, useRef, useEffect)
- `lucide-react` (icons: Menu, X, LayoutDashboard, ShoppingCart, FileText, Package, Calculator, BarChart3, Settings, ChevronRight, LogOut, Sun, Moon, Languages)
- Tailwind CSS v4
