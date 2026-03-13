import { useState } from 'react'
import {
  Search, Download, ChevronRight, X,
  Plus, Pencil, Trash2, Eye, LogIn,
} from 'lucide-react'
import type { AuditLogEntry } from '../../types'

interface AuditPanelProps {
  auditLog: AuditLogEntry[]
}

// ─── Action badge ──────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: AuditLogEntry['action'] }) {
  const styles: Record<AuditLogEntry['action'], string> = {
    create: 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300',
    update: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300',
    delete: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300',
    login: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
    export: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
  }
  const icons: Record<AuditLogEntry['action'], React.ReactNode> = {
    create: <Plus className="w-3 h-3" />,
    update: <Pencil className="w-3 h-3" />,
    delete: <Trash2 className="w-3 h-3" />,
    login: <LogIn className="w-3 h-3" />,
    export: <Download className="w-3 h-3" />,
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${styles[action]}`}>
      {icons[action]} {action}
    </span>
  )
}

// ─── User avatar ───────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['bg-violet-500', 'bg-teal-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div className={`w-7 h-7 ${color} rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
      {initials}
    </div>
  )
}

// ─── Detail slide-over ─────────────────────────────────────────────────────────

function AuditDetailPanel({ entry, onClose }: { entry: AuditLogEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 dark:bg-black/60" onClick={onClose} />
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 shadow-2xl flex flex-col h-full border-l border-zinc-200 dark:border-zinc-700">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Audit Entry</h3>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{entry.id}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Core metadata */}
          <div className="space-y-3">
            {[
              { label: 'Timestamp', value: new Date(entry.timestamp).toLocaleString() },
              { label: 'User', value: entry.user },
              { label: 'Module', value: entry.module },
              { label: 'Entity', value: `${entry.entity} · ${entry.entityId}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between gap-4">
                <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0 w-20">{label}</span>
                <span className="text-xs text-zinc-700 dark:text-zinc-300 text-right leading-relaxed">{value}</span>
              </div>
            ))}
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0 w-20">Action</span>
              <ActionBadge action={entry.action} />
            </div>
          </div>

          {/* Summary */}
          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Summary</p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{entry.summary}</p>
          </div>

          {/* Before */}
          {entry.before && (
            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Before</p>
              <pre className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(entry.before, null, 2)}
              </pre>
            </div>
          )}

          {/* After */}
          {entry.after && (
            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">After</p>
              <pre className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(entry.after, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AuditPanel({ auditLog }: AuditPanelProps) {
  const [search, setSearch] = useState('')
  const [filterModule, setFilterModule] = useState('all')
  const [filterAction, setFilterAction] = useState('all')
  const [selected, setSelected] = useState<AuditLogEntry | null>(null)

  const modules = ['all', ...Array.from(new Set(auditLog.map(e => e.module)))]
  const actions: Array<AuditLogEntry['action'] | 'all'> = ['all', 'create', 'update', 'delete', 'login', 'export']

  const filtered = auditLog.filter(e => {
    const matchSearch = !search ||
      e.user.toLowerCase().includes(search.toLowerCase()) ||
      e.summary.toLowerCase().includes(search.toLowerCase()) ||
      e.entity.toLowerCase().includes(search.toLowerCase())
    const matchModule = filterModule === 'all' || e.module === filterModule
    const matchAction = filterAction === 'all' || e.action === filterAction
    return matchSearch && matchModule && matchAction
  })

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl space-y-4">

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by user, entity, or summary…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
            />
          </div>

          {/* Module filter */}
          <select
            value={filterModule}
            onChange={e => setFilterModule(e.target.value)}
            className="appearance-none px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
          >
            {modules.map(m => (
              <option key={m} value={m}>{m === 'all' ? 'All modules' : m}</option>
            ))}
          </select>

          {/* Action filter */}
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="appearance-none px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
          >
            {actions.map(a => (
              <option key={a} value={a}>
                {a === 'all' ? 'All actions' : a.charAt(0).toUpperCase() + a.slice(1)}
              </option>
            ))}
          </select>

          {/* Export */}
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors shrink-0">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>

        {/* Log table */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[140px_1fr_90px_1.5fr_20px] gap-3 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
            {['Time', 'User', 'Action', 'Summary', ''].map((h, i) => (
              <span key={i} className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{h}</span>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Eye className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No log entries match your filters</p>
              <button
                onClick={() => { setSearch(''); setFilterModule('all'); setFilterAction('all') }}
                className="mt-2 text-xs text-violet-600 dark:text-violet-400 hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : filtered.map((entry, idx) => (
            <div
              key={entry.id}
              onClick={() => setSelected(entry)}
              className={`grid grid-cols-[140px_1fr_90px_1.5fr_20px] gap-3 px-4 py-3 items-center cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/30 ${
                idx < filtered.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''
              }`}
            >
              {/* Time */}
              <div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300">
                  {new Date(entry.timestamp).toLocaleDateString()}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              {/* User */}
              <div className="flex items-center gap-2 min-w-0">
                <Avatar name={entry.user} />
                <div className="min-w-0">
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{entry.user}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">{entry.module}</p>
                </div>
              </div>

              {/* Action */}
              <ActionBadge action={entry.action} />

              {/* Summary */}
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{entry.summary}</p>

              {/* Arrow */}
              <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0" />
            </div>
          ))}
        </div>

        <p className="text-xs text-zinc-400 dark:text-zinc-500 px-1">
          {filtered.length} of {auditLog.length} entries shown
        </p>
      </div>

      {selected && (
        <AuditDetailPanel entry={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
