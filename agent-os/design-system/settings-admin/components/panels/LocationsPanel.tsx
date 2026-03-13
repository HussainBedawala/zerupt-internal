import { useState } from 'react'
import {
  Plus, MapPin, Clock, Users, ChevronRight, MoreHorizontal,
  X, Check, Phone, Mail, Globe, CreditCard, Store, Wifi,
  WifiOff, ChevronDown, Trash2, Copy,
} from 'lucide-react'
import type { Branch } from '../../types'

interface LocationsPanelProps {
  branches: Branch[]
  onSaveBranch?: (branch: Partial<Branch>) => void
  onArchiveBranch?: (branchId: string) => void
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Input({ value, onChange, placeholder, type = 'text', disabled = false }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 dark:focus:border-violet-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    />
  )
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 dark:focus:border-violet-400 transition-colors pr-8"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
    </div>
  )
}

// ─── Branch status badge ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Branch['status'] }) {
  return status === 'active'
    ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
        <Wifi className="w-3 h-3" /> Active
      </span>
    )
    : (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
        <WifiOff className="w-3 h-3" /> Inactive
      </span>
    )
}

// ─── Branch detail panel (slide-over) ────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const TIMES = Array.from({ length: 24 * 2 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
})
const TIME_OPTIONS = TIMES.map(t => ({ value: t, label: t }))

const CURRENCIES = [
  { value: 'AED', label: 'AED — UAE Dirham' }, { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' }, { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'INR', label: 'INR — Indian Rupee' }, { value: 'SAR', label: 'SAR — Saudi Riyal' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
]

type DetailTab = 'details' | 'hours' | 'pos'

interface BranchDetailProps {
  branch: Branch
  onClose: () => void
  onSave?: (branch: Partial<Branch>) => void
  onArchive?: (id: string) => void
}

function BranchDetail({ branch, onClose, onSave, onArchive }: BranchDetailProps) {
  const [form, setForm] = useState({ ...branch })
  const [hours, setHours] = useState(
    DAYS.map(day => {
      const existing = branch.operatingHours?.find(h => h.day === day)
      return existing ?? { day, open: '09:00', close: '18:00', closed: false }
    })
  )
  const [activeTab, setActiveTab] = useState<DetailTab>('details')
  const [isDirty, setIsDirty] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)

  function set<K extends keyof Branch>(key: K, value: Branch[K]) {
    setForm(f => ({ ...f, [key]: value }))
    setIsDirty(true)
  }

  function setAddr(key: keyof Branch['address'], value: string) {
    setForm(f => ({ ...f, address: { ...f.address, [key]: value } }))
    setIsDirty(true)
  }

  function toggleDay(day: string) {
    setHours(prev => prev.map(h => h.day === day ? { ...h, closed: !h.closed } : h))
    setIsDirty(true)
  }

  function setHourField(day: string, key: 'open' | 'close', value: string) {
    setHours(prev => prev.map(h => h.day === day ? { ...h, [key]: value } : h))
    setIsDirty(true)
  }

  function handleSave() {
    onSave?.({ ...form, operatingHours: hours })
    setIsDirty(false)
  }

  const tabs: { id: DetailTab; label: string; icon: React.ElementType }[] = [
    { id: 'details', label: 'Details', icon: MapPin },
    { id: 'hours', label: 'Hours', icon: Clock },
    { id: 'pos', label: 'POS Settings', icon: Store },
  ]

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 dark:bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
              <Store className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                {form.name || 'New Branch'}
              </h2>
              <div className="mt-0.5"><StatusBadge status={form.status} /></div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 px-5 shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-1 py-3 text-xs font-medium border-b-2 mr-5 transition-colors ${
                activeTab === tab.id
                  ? 'border-violet-600 dark:border-violet-400 text-violet-700 dark:text-violet-300'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'details' && (
            <div className="px-5 py-5 space-y-5">
              {/* Basic info */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Identity</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Branch Name</label>
                    <Input value={form.name} onChange={v => set('name', v)} placeholder="e.g. Dubai Mall" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Branch Code</label>
                    <Input value={form.code} onChange={v => set('code', v.toUpperCase())} placeholder="DXB-MALL" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Status</label>
                    <Select
                      value={form.status}
                      onChange={v => set('status', v as Branch['status'])}
                      options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
                    />
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Contact</p>
                <div className="grid grid-cols-1 gap-3">
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                    <input
                      value={form.phone}
                      onChange={e => set('phone', e.target.value)}
                      placeholder="+971 4 000 0000"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
                    />
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => set('email', e.target.value)}
                      placeholder="branch@company.com"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Address</p>
                <div className="space-y-2">
                  <Input value={form.address.line1} onChange={v => setAddr('line1', v)} placeholder="Street address" />
                  <Input value={form.address.line2} onChange={v => setAddr('line2', v)} placeholder="Floor, unit (optional)" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={form.address.city} onChange={v => setAddr('city', v)} placeholder="City" />
                    <Input value={form.address.state} onChange={v => setAddr('state', v)} placeholder="State / Emirate" />
                  </div>
                  <Input value={form.address.country} onChange={v => setAddr('country', v)} placeholder="Country" />
                </div>
              </div>

              {/* Currency & Tax */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Currency & Tax</p>
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block flex items-center gap-1">
                    <CreditCard className="w-3 h-3" /> Branch Currency
                  </label>
                  <Select value={form.currency} onChange={v => set('currency', v)} options={CURRENCIES} />
                </div>
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Tax Override</span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-auto">Optional</span>
                  </div>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    By default this branch uses the global tax framework. Set an override to apply different rates for this location.
                  </p>
                  <button className="mt-2 text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium">
                    Configure tax override →
                  </button>
                </div>
              </div>

              {/* Document prefix */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Document Numbering</p>
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Prefix Override</label>
                  <Input
                    value={form.documentPrefixOverride ?? ''}
                    onChange={v => set('documentPrefixOverride', v || null)}
                    placeholder="Leave blank to use global prefix"
                  />
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                    When set, this branch's documents will use this prefix instead of the global one. e.g. INV-<strong>{form.documentPrefixOverride ?? 'GLOBAL'}</strong>-0001
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'hours' && (
            <div className="px-5 py-5">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                Set operating hours per day. Closed days are excluded from scheduling and POS shift prompts.
              </p>
              <div className="space-y-2">
                {hours.map(h => (
                  <div
                    key={h.day}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      h.closed
                        ? 'bg-zinc-50 dark:bg-zinc-800/30 border-zinc-200 dark:border-zinc-800 opacity-60'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    {/* Day name */}
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 w-24 shrink-0">{h.day}</span>

                    {/* Time selectors */}
                    {h.closed ? (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 flex-1">Closed</span>
                    ) : (
                      <div className="flex items-center gap-2 flex-1">
                        <Select
                          value={h.open || '09:00'}
                          onChange={v => setHourField(h.day, 'open', v)}
                          options={TIME_OPTIONS}
                        />
                        <span className="text-xs text-zinc-400 shrink-0">to</span>
                        <Select
                          value={h.close || '18:00'}
                          onChange={v => setHourField(h.day, 'close', v)}
                          options={TIME_OPTIONS}
                        />
                      </div>
                    )}

                    {/* Closed toggle */}
                    <button
                      onClick={() => toggleDay(h.day)}
                      className={`shrink-0 w-8 h-5 rounded-full transition-colors relative ${
                        !h.closed ? 'bg-teal-500 dark:bg-teal-400' : 'bg-zinc-300 dark:bg-zinc-600'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        !h.closed ? 'translate-x-3.5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'pos' && (
            <div className="px-5 py-5 space-y-5">
              {form.posSettings ? (
                <>
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Receipt Header</label>
                    <textarea
                      value={form.posSettings.receiptHeader}
                      onChange={e => set('posSettings', { ...form.posSettings!, receiptHeader: e.target.value })}
                      rows={2}
                      placeholder="Printed at top of receipts"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Receipt Footer</label>
                    <textarea
                      value={form.posSettings.receiptFooter}
                      onChange={e => set('posSettings', { ...form.posSettings!, receiptFooter: e.target.value })}
                      rows={2}
                      placeholder="Thank you message, return policy, etc."
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors resize-none"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">Enabled Payment Methods</p>
                    <div className="flex flex-wrap gap-2">
                      {['cash', 'card', 'apple_pay', 'google_pay', 'bank_transfer', 'split'].map(method => {
                        const isEnabled = form.posSettings!.enabledPaymentMethods.includes(method)
                        return (
                          <button
                            key={method}
                            onClick={() => {
                              const current = form.posSettings!.enabledPaymentMethods
                              set('posSettings', {
                                ...form.posSettings!,
                                enabledPaymentMethods: isEnabled
                                  ? current.filter(m => m !== method)
                                  : [...current, method],
                              })
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium ${
                              isEnabled
                                ? 'bg-teal-100 dark:bg-teal-950 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300'
                                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'
                            }`}
                          >
                            {isEnabled && <Check className="w-3 h-3" />}
                            {method.replace('_', ' ')}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-10">
                  <Store className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No POS configured for this branch.</p>
                  <button
                    onClick={() => set('posSettings', { receiptHeader: '', receiptFooter: '', enabledPaymentMethods: ['cash', 'card'] })}
                    className="mt-3 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    Enable POS for this branch
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`shrink-0 border-t px-5 py-3 flex items-center justify-between transition-colors ${
          isDirty
            ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800'
            : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800'
        }`}>
          <div>
            {showArchiveConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 dark:text-red-400">Archive this branch?</span>
                <button
                  onClick={() => { onArchive?.(branch.id); onClose() }}
                  className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowArchiveConfirm(false)}
                  className="text-xs text-zinc-500 dark:text-zinc-400 hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowArchiveConfirm(true)}
                className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Archive branch
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isDirty && (
              <button
                onClick={() => { setForm({ ...branch }); setIsDirty(false) }}
                className="px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                Discard
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!isDirty}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                isDirty
                  ? 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white shadow-sm shadow-violet-600/20'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
              }`}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── New branch form (empty state for adding) ─────────────────────────────────

function newBranch(): Branch {
  return {
    id: `br_new_${Date.now()}`,
    name: '',
    code: '',
    status: 'active',
    address: { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' },
    phone: '',
    email: '',
    timezone: 'Asia/Dubai',
    currency: 'AED',
    taxOverride: null,
    operatingHours: DAYS.map(day => ({ day, open: '09:00', close: '18:00', closed: false })),
    documentPrefixOverride: null,
    assignedUserIds: [],
    warehouseIds: [],
    posSettings: null,
  }
}

// ─── Main component ────────────────────────────────────────────────────────────

export function LocationsPanel({ branches, onSaveBranch, onArchiveBranch }: LocationsPanelProps) {
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const activeBranches = branches.filter(b => b.status === 'active')
  const inactiveBranches = branches.filter(b => b.status === 'inactive')

  function openBranch(branch: Branch) {
    setSelectedBranch(branch)
    setIsCreating(false)
  }

  function openNew() {
    setSelectedBranch(newBranch())
    setIsCreating(true)
  }

  function handleClose() {
    setSelectedBranch(null)
    setIsCreating(false)
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {activeBranches.length} active · {inactiveBranches.length} inactive
            </p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white rounded-lg transition-colors shadow-sm shadow-violet-600/20"
          >
            <Plus className="w-4 h-4" /> Add Branch
          </button>
        </div>

        {/* Active branches */}
        {activeBranches.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Active</p>
            <div className="space-y-2">
              {activeBranches.map(branch => (
                <BranchCard
                  key={branch.id}
                  branch={branch}
                  onClick={() => openBranch(branch)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Inactive branches */}
        {inactiveBranches.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Inactive</p>
            <div className="space-y-2 opacity-60">
              {inactiveBranches.map(branch => (
                <BranchCard
                  key={branch.id}
                  branch={branch}
                  onClick={() => openBranch(branch)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {branches.length === 0 && (
          <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700">
            <MapPin className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No branches yet</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Add your first branch to get started.</p>
            <button
              onClick={openNew}
              className="mt-4 px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
            >
              Add Branch
            </button>
          </div>
        )}
      </div>

      {/* Detail slide-over */}
      {selectedBranch && (
        <BranchDetail
          branch={selectedBranch}
          onClose={handleClose}
          onSave={(data) => { onSaveBranch?.(data); handleClose() }}
          onArchive={(id) => { onArchiveBranch?.(id); handleClose() }}
        />
      )}
    </div>
  )
}

// ─── Branch card ──────────────────────────────────────────────────────────────

function BranchCard({ branch, onClick }: { branch: Branch; onClick: () => void }) {
  const activeDays = branch.operatingHours?.filter(h => !h.closed) ?? []
  const firstHour = activeDays[0]

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-sm transition-all p-4 group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
            <Store className="w-4 h-4 text-zinc-500 dark:text-zinc-400" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{branch.name}</span>
              <StatusBadge status={branch.status} />
              <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                {branch.code}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {[branch.address.line1, branch.address.city, branch.address.country].filter(Boolean).join(', ')}
            </p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {branch.phone && (
                <span className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                  <Phone className="w-3 h-3" /> {branch.phone}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                <CreditCard className="w-3 h-3" /> {branch.currency}
              </span>
              {firstHour && (
                <span className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                  <Clock className="w-3 h-3" /> {firstHour.open}–{firstHour.close}
                </span>
              )}
              {branch.assignedUserIds.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                  <Users className="w-3 h-3" /> {branch.assignedUserIds.length} staff
                </span>
              )}
            </div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors shrink-0 mt-1" />
      </div>
    </button>
  )
}
