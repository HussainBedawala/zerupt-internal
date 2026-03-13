import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { MainNav, defaultNavItems, type NavItem } from './MainNav'
import { UserMenu } from './UserMenu'

interface AppShellProps {
  children: React.ReactNode
  navigationItems?: NavItem[]
  activeNavId?: string
  user?: { name: string; email?: string; avatarUrl?: string }
  onNavigate?: (href: string) => void
  onLogout?: () => void
  onToggleLanguage?: () => void
  onToggleTheme?: () => void
  currentLanguage?: 'en' | 'ar'
  currentTheme?: 'light' | 'dark'
}

export function AppShell({
  children,
  navigationItems = defaultNavItems,
  activeNavId = 'dashboard',
  user,
  onNavigate,
  onLogout,
  onToggleLanguage,
  onToggleTheme,
  currentLanguage = 'en',
  currentTheme = 'light',
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-zinc-100 dark:bg-zinc-950" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* Desktop sidebar: expanding nav + user menu */}
      <aside className="hidden md:flex h-full shrink-0 bg-zinc-950 relative">
        <MainNav items={navigationItems} activeId={activeNavId} onNavigate={onNavigate} user={user} onLogout={onLogout} onToggleLanguage={onToggleLanguage} onToggleTheme={onToggleTheme} currentLanguage={currentLanguage} currentTheme={currentTheme} />
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 bg-zinc-950 flex items-center px-4 z-50 gap-3">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shadow shadow-violet-600/30">
          <span className="text-white font-bold text-sm">M</span>
        </div>
        <span className="text-sm font-semibold text-zinc-100">Zerupt</span>
        <div className="ml-auto">
          <UserMenu
            user={user}
            onLogout={onLogout}
            onToggleLanguage={onToggleLanguage}
            onToggleTheme={onToggleTheme}
            currentLanguage={currentLanguage}
            currentTheme={currentTheme}
          />
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
          <div className="md:hidden fixed top-14 left-0 bottom-0 w-72 bg-zinc-950 z-50 overflow-y-auto py-3">
            {navigationItems.map((item) => {
              const Icon = item.icon
              const isActive = item.id === activeNavId
              return (
                <div key={item.id}>
                  <button
                    onClick={() => { onNavigate?.(item.href); if (!item.children) setMobileOpen(false) }}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                      isActive ? 'text-violet-400 bg-violet-600/10' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" strokeWidth={1.5} />
                    {item.label}
                  </button>
                  {item.children && (
                    <div className="ml-[52px] border-l border-zinc-800 mb-1">
                      {item.children.map((c) => (
                        <button
                          key={c.href}
                          onClick={() => { onNavigate?.(c.href); setMobileOpen(false) }}
                          className="w-full text-left px-4 py-2 text-[13px] text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-colors"
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Content area */}
      <main className="flex-1 min-w-0 overflow-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
