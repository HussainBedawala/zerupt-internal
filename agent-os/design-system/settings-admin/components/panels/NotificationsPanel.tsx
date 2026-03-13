import { useState } from 'react'
import { Bell, Mail, Monitor, Layers } from 'lucide-react'
import type { NotificationEvent, NotificationChannel } from '../../types'

interface NotificationsPanelProps {
  notificationEvents: NotificationEvent[]
  onSaveNotificationEvent?: (eventId: string, data: Partial<NotificationEvent>) => void
}

// ─── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? 'bg-violet-600 dark:bg-violet-500' : 'bg-zinc-200 dark:bg-zinc-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition duration-200 ease-in-out ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ─── Channel label ─────────────────────────────────────────────────────────────

function ChannelIcon({ channel }: { channel: NotificationChannel }) {
  if (channel === 'both') return <Layers className="w-3 h-3" />
  if (channel === 'email') return <Mail className="w-3 h-3" />
  return <Monitor className="w-3 h-3" />
}

// ─── Main component ────────────────────────────────────────────────────────────

export function NotificationsPanel({ notificationEvents, onSaveNotificationEvent }: NotificationsPanelProps) {
  const [events, setEvents] = useState(notificationEvents)
  const [dirty, setDirty] = useState(false)

  function update(eventId: string, patch: Partial<NotificationEvent>) {
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, ...patch } : e))
    setDirty(true)
  }

  function save() {
    events.forEach(e => onSaveNotificationEvent?.(e.id, e))
    setDirty(false)
  }

  function discard() {
    setEvents(notificationEvents)
    setDirty(false)
  }

  const enabledCount = events.filter(e => e.enabled).length

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl space-y-5">

          {/* Summary bar */}
          <div className="flex items-center gap-3 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-950 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {enabledCount} of {events.length} notifications active
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Users can override these preferences in their own profile settings.
              </p>
            </div>
          </div>

          {/* Event table */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_160px_130px_52px] gap-4 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              {['Event', 'Delivery channel', 'Threshold', 'Active'].map((h, i) => (
                <span key={i} className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{h}</span>
              ))}
            </div>

            {events.map((event, idx) => (
              <div
                key={event.id}
                className={`grid grid-cols-[1fr_160px_130px_52px] gap-4 px-4 py-4 items-start transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/30 ${
                  idx < events.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''
                } ${!event.enabled ? 'opacity-50' : ''}`}
              >
                {/* Event info */}
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-snug">{event.label}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 leading-relaxed">{event.description}</p>
                </div>

                {/* Channel */}
                <div className="pt-1">
                  <div className="relative">
                    <select
                      value={event.channel}
                      onChange={e => update(event.id, { channel: e.target.value as NotificationChannel })}
                      disabled={!event.enabled}
                      className="w-full appearance-none pl-7 pr-2 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <option value="in_app">In-app only</option>
                      <option value="email">Email only</option>
                      <option value="both">Both channels</option>
                    </select>
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                      <ChannelIcon channel={event.channel} />
                    </span>
                  </div>
                </div>

                {/* Threshold */}
                <div className="pt-1">
                  {event.threshold ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={event.threshold.value}
                        min={0}
                        disabled={!event.enabled}
                        onChange={e => update(event.id, {
                          threshold: { ...event.threshold!, value: Number(e.target.value) }
                        })}
                        className="w-14 px-2 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors disabled:opacity-40 text-center tabular-nums"
                      />
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">{event.threshold.unit}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-300 dark:text-zinc-600 pt-1 block">—</span>
                  )}
                </div>

                {/* Toggle */}
                <div className="pt-1 flex justify-end">
                  <Toggle checked={event.enabled} onChange={v => update(event.id, { enabled: v })} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed footer */}
      <div className={`shrink-0 border-t px-6 py-3 flex items-center gap-3 transition-colors ${
        dirty
          ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800'
          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
      }`}>
        {dirty && (
          <span className="text-xs text-violet-600 dark:text-violet-400 mr-auto">Unsaved changes</span>
        )}
        <button
          onClick={discard}
          disabled={!dirty}
          className="ml-auto px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Discard
        </button>
        <button
          onClick={save}
          disabled={!dirty}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
            dirty
              ? 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white shadow-sm shadow-violet-600/20'
              : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
          }`}
        >
          Save Changes
        </button>
      </div>
    </div>
  )
}
