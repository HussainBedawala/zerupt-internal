import { useState, useRef, useEffect } from 'react'
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  Package,
  Calculator,
  BarChart3,
  Settings,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { UserMenu } from './UserMenu'

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  href: string
  isActive?: boolean
  children?: Array<{ label: string; href: string; isActive?: boolean }>
}

interface MainNavProps {
  items: NavItem[]
  activeId?: string
  onNavigate?: (href: string) => void
  user?: { name: string; email?: string; avatarUrl?: string }
  onLogout?: () => void
  onToggleLanguage?: () => void
  onToggleTheme?: () => void
  currentLanguage?: 'en' | 'ar'
  currentTheme?: 'light' | 'dark'
}

export const defaultNavItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'pos', label: 'POS', icon: ShoppingCart, href: '/pos' },
  {
    id: 'sales-purchase', label: 'Sales', icon: FileText, href: '/sales',
    children: [
      { label: 'Quotations', href: '/sales/quotations' },
      { label: 'Sales Orders', href: '/sales/orders' },
      { label: 'Invoices', href: '/sales/invoices' },
      { label: 'Credit Notes', href: '/sales/credit-notes' },
      { label: 'Purchase Orders', href: '/purchase/orders' },
      { label: 'GRN', href: '/purchase/grn' },
      { label: 'Purchase Returns', href: '/purchase/returns' },
      { label: 'Customers', href: '/sales/customers' },
      { label: 'Suppliers', href: '/purchase/suppliers' },
    ],
  },
  {
    id: 'inventory', label: 'Inventory', icon: Package, href: '/inventory',
    children: [
      { label: 'Items', href: '/inventory/items' },
      { label: 'Warehouses', href: '/inventory/warehouses' },
      { label: 'Stock Transfers', href: '/inventory/transfers' },
      { label: 'Adjustments', href: '/inventory/adjustments' },
      { label: 'Serial Numbers', href: '/inventory/serials' },
    ],
  },
  {
    id: 'accounting', label: 'Accounting', icon: Calculator, href: '/accounting',
    children: [
      { label: 'Chart of Accounts', href: '/accounting/coa' },
      { label: 'Journal Entries', href: '/accounting/journals' },
      { label: 'Cheques', href: '/accounting/cheques' },
      { label: 'Receipt Vouchers', href: '/accounting/receipts' },
      { label: 'Payment Vouchers', href: '/accounting/payments' },
      { label: 'Financial Statements', href: '/accounting/statements' },
      { label: 'VAT Returns', href: '/accounting/vat' },
    ],
  },
  {
    id: 'reports', label: 'Reports', icon: BarChart3, href: '/reports',
    children: [
      { label: 'Report Builder', href: '/reports/builder' },
      { label: 'Saved Reports', href: '/reports/saved' },
    ],
  },
  {
    id: 'settings', label: 'Settings', icon: Settings, href: '/settings',
    children: [
      { label: 'Organisation', href: '/settings/organisation' },
      { label: 'Taxation', href: '/settings/taxation' },
      { label: 'Locations & Branches', href: '/settings/locations' },
      { label: 'Team & Users', href: '/settings/team' },
      { label: 'Roles & Permissions', href: '/settings/roles' },
      { label: 'Currencies & Rates', href: '/settings/currencies' },
      { label: 'Price Lists', href: '/settings/pricelists' },
      { label: 'Notifications', href: '/settings/notifications' },
      { label: 'Audit Trail', href: '/settings/audit' },
      { label: 'Data Import', href: '/settings/import' },
      { label: 'Integrations & API', href: '/settings/integrations' },
      { label: 'Appearance & Language', href: '/settings/appearance' },
    ],
  },
]

export function MainNav({ items, activeId, onNavigate, user, onLogout, onToggleLanguage, onToggleTheme, currentLanguage, currentTheme }: MainNavProps) {
  const [hovered, setHovered] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startHover = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setHovered(true)
  }
  const endHover = () => {
    timeoutRef.current = setTimeout(() => {
      setHovered(false)
      setExpandedId(null)
    }, 200)
  }

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }, [])

  const expanded = hovered
  const expandedItem = expandedId ? items.find((i) => i.id === expandedId) : null
  const showSubmenu = expandedItem?.children && expandedItem.children.length > 0

  return (
    <div
      className="relative h-full shrink-0 z-30"
      onMouseEnter={startHover}
      onMouseLeave={endHover}
      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      {/* Sidebar — collapses to icons, expands with labels on hover */}
      <div
        className={`h-full bg-zinc-950 flex flex-col py-5 transition-all duration-200 ease-out overflow-hidden ${
          expanded ? 'w-[200px]' : 'w-[64px]'
        }`}
      >
        {/* Logo */}
        <div className={`flex items-center gap-3 mb-6 ${expanded ? 'px-4' : 'px-0 justify-center'}`}>
          <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-600/30 shrink-0">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          {expanded && (
            <span className="text-sm font-bold text-zinc-100 whitespace-nowrap">Zerupt</span>
          )}
        </div>

        {/* Nav items */}
        <div className="flex flex-col gap-1 flex-1 px-2">
          {items.map((item) => {
            const isActive = item.id === activeId
            const isSubExpanded = item.id === expandedId
            const Icon = item.icon
            const hasChildren = item.children && item.children.length > 0

            return (
              <div key={item.id}>
                <button
                  onClick={() => {
                    if (hasChildren) {
                      setExpandedId(isSubExpanded ? null : item.id)
                      setHovered(true)
                    } else {
                      onNavigate?.(item.href)
                    }
                  }}
                  className={`w-full flex items-center gap-3 rounded-xl transition-all duration-150 ${
                    expanded ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center'
                  } ${
                    isActive
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-600/25'
                      : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                  {expanded && (
                    <>
                      <span className="text-[13px] font-medium whitespace-nowrap flex-1 text-left">
                        {item.label}
                      </span>
                      {hasChildren && (
                        <ChevronRight
                          className={`w-3.5 h-3.5 transition-transform duration-150 ${
                            isSubExpanded ? 'rotate-90' : ''
                          } ${isActive ? 'text-violet-200' : 'text-zinc-600'}`}
                          strokeWidth={2}
                        />
                      )}
                    </>
                  )}
                </button>

                {/* Inline sub-items when expanded */}
                {expanded && isSubExpanded && hasChildren && (
                  <div className="ml-4 pl-4 border-l border-zinc-800 mt-1 mb-1 space-y-0.5">
                    {item.children!.map((child) => (
                      <button
                        key={child.href}
                        onClick={() => onNavigate?.(child.href)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                          child.isActive
                            ? 'text-violet-400 bg-violet-600/10'
                            : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50'
                        }`}
                      >
                        {child.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* User menu at bottom */}
        <div className={`pt-2 border-t border-zinc-800/50 ${expanded ? 'px-3 pb-4' : 'pb-4 flex justify-center'}`}>
          <UserMenu
            user={user}
            onLogout={onLogout}
            onToggleLanguage={onToggleLanguage}
            onToggleTheme={onToggleTheme}
            currentLanguage={currentLanguage}
            currentTheme={currentTheme}
          />
        </div>
      </div>

      {/* Submenu flyout — only when sidebar is collapsed and item has children */}
      {!expanded && showSubmenu && (
        <div className="absolute left-[64px] top-0 h-full w-[200px] bg-zinc-900 border-r border-zinc-800 shadow-xl z-20">
          <div className="p-4 pt-6">
            <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3">
              {expandedItem?.label}
            </h3>
            <div className="flex flex-col gap-0.5">
              {expandedItem?.children?.map((child) => (
                <button
                  key={child.href}
                  onClick={() => onNavigate?.(child.href)}
                  className="text-left px-3 py-2.5 rounded-lg text-[13px] font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                >
                  {child.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
