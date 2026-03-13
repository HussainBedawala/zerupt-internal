import { useState, useRef, useEffect } from 'react'
import { LogOut, Sun, Moon, Languages } from 'lucide-react'

interface UserMenuProps {
  user?: { name: string; email?: string; avatarUrl?: string }
  onLogout?: () => void
  onToggleLanguage?: () => void
  onToggleTheme?: () => void
  currentLanguage?: 'en' | 'ar'
  currentTheme?: 'light' | 'dark'
}

export function UserMenu({
  user,
  onLogout,
  onToggleLanguage,
  onToggleTheme,
  currentLanguage = 'en',
  currentTheme = 'light',
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    if (isOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  return (
    <div ref={ref} className="relative" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
          isOpen
            ? 'bg-violet-600 text-white'
            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
        }`}
      >
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-xl object-cover" />
        ) : (
          <span className="text-xs font-bold">{initials}</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute bottom-14 left-0 w-60 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1.5 z-50">
          {user && (
            <div className="px-4 py-3 border-b border-zinc-800">
              <p className="text-sm font-semibold text-zinc-100">{user.name}</p>
              {user.email && <p className="text-xs text-zinc-500 mt-0.5">{user.email}</p>}
            </div>
          )}

          <div className="py-1">
            <button
              onClick={() => { onToggleLanguage?.(); setIsOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <Languages className="w-4 h-4" strokeWidth={1.5} />
              {currentLanguage === 'en' ? 'العربية' : 'English'}
            </button>
            <button
              onClick={() => { onToggleTheme?.(); setIsOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              {currentTheme === 'light' ? <Moon className="w-4 h-4" strokeWidth={1.5} /> : <Sun className="w-4 h-4" strokeWidth={1.5} />}
              {currentTheme === 'light' ? 'Dark mode' : 'Light mode'}
            </button>
          </div>

          <div className="border-t border-zinc-800 py-1">
            <button
              onClick={() => { onLogout?.(); setIsOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-zinc-800 transition-colors"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
