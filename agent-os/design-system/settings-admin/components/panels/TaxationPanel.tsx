import { useState } from 'react'
import { ChevronDown, Plus, Trash2, Info, CheckCircle2, Globe, Layers, Tags, AlertTriangle } from 'lucide-react'
import type { TaxFramework, TaxComponent, TaxGroup, TaxType, TaxAppliesTo } from '../../types'

interface TaxationPanelProps {
  taxFrameworks: TaxFramework[]
  activeTaxFramework: string
  onSaveTaxFramework?: (frameworkId: string, components: TaxComponent[], groups: TaxGroup[]) => void
}

const COUNTRY_FLAGS: Record<string, string> = {
  AE: '🇦🇪', SA: '🇸🇦', IN: '🇮🇳', SG: '🇸🇬', GB: '🇬🇧',
  US: '🇺🇸', DE: '🇩🇪', AU: '🇦🇺', null: '🌐',
}

const APPLIES_TO_LABELS: Record<TaxAppliesTo, string> = {
  sales: 'Sales',
  purchases: 'Purchases',
  imports: 'Imports',
  intrastate_sales: 'Intra-state Sales',
  intrastate_purchases: 'Intra-state Purchases',
  interstate_sales: 'Inter-state Sales',
  interstate_purchases: 'Inter-state Purchases',
}

const TAX_TYPE_OPTIONS: { value: TaxType; label: string }[] = [
  { value: 'percentage', label: 'Percentage (%)' },
  { value: 'fixed', label: 'Fixed Amount' },
  { value: 'exempt', label: 'Exempt' },
]

const APPLIES_TO_OPTIONS: TaxAppliesTo[] = [
  'sales', 'purchases', 'imports', 'intrastate_sales', 'intrastate_purchases', 'interstate_sales', 'interstate_purchases',
]

function Badge({ children, color = 'zinc' }: { children: React.ReactNode; color?: 'zinc' | 'violet' | 'teal' | 'amber' }) {
  const colors = {
    zinc: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
    violet: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300',
    teal: 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300',
    amber: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  )
}

function Input({ value, onChange, placeholder, type = 'text', className = '' }: {
  value: string | number; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 dark:focus:border-violet-400 transition-colors ${className}`}
    />
  )
}

function Select({ value, onChange, options, className = '' }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string
}) {
  return (
    <div className={`relative ${className}`}>
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

export function TaxationPanel({ taxFrameworks, activeTaxFramework, onSaveTaxFramework }: TaxationPanelProps) {
  const [selectedFrameworkId, setSelectedFrameworkId] = useState(activeTaxFramework)
  const [isDirty, setIsDirty] = useState(false)
  const [showFrameworkChange, setShowFrameworkChange] = useState(false)
  const [pendingFrameworkId, setPendingFrameworkId] = useState<string | null>(null)

  const currentFramework = taxFrameworks.find(f => f.id === selectedFrameworkId)!
  const [components, setComponents] = useState<TaxComponent[]>(currentFramework?.components ?? [])
  const [groups, setGroups] = useState<TaxGroup[]>(currentFramework?.groups ?? [])

  function handleFrameworkChange(fwId: string) {
    if (fwId !== selectedFrameworkId) {
      setPendingFrameworkId(fwId)
      setShowFrameworkChange(true)
    }
  }

  function confirmFrameworkChange() {
    const fw = taxFrameworks.find(f => f.id === pendingFrameworkId)!
    setSelectedFrameworkId(pendingFrameworkId!)
    setComponents([...fw.components])
    setGroups([...fw.groups])
    setShowFrameworkChange(false)
    setIsDirty(true)
  }

  function updateComponent(id: string, key: keyof TaxComponent, value: unknown) {
    setComponents(prev => prev.map(c => c.id === id ? { ...c, [key]: value } : c))
    setIsDirty(true)
  }

  function addComponent() {
    const newComp: TaxComponent = {
      id: `tc_custom_${Date.now()}`,
      name: '',
      code: '',
      rate: 0,
      type: 'percentage',
      appliesTo: ['sales', 'purchases'],
    }
    setComponents(prev => [...prev, newComp])
    setIsDirty(true)
  }

  function removeComponent(id: string) {
    setComponents(prev => prev.filter(c => c.id !== id))
    setGroups(prev => prev.map(g => ({ ...g, components: g.components.filter(cId => cId !== id) })))
    setIsDirty(true)
  }

  function toggleComponentAppliesTo(compId: string, applies: TaxAppliesTo) {
    setComponents(prev => prev.map(c => {
      if (c.id !== compId) return c
      const current = c.appliesTo as TaxAppliesTo[]
      return {
        ...c,
        appliesTo: current.includes(applies)
          ? current.filter(a => a !== applies)
          : [...current, applies],
      }
    }))
    setIsDirty(true)
  }

  function addGroup() {
    const newGroup: TaxGroup = {
      id: `tg_custom_${Date.now()}`,
      name: '',
      components: [],
      isDefault: false,
    }
    setGroups(prev => [...prev, newGroup])
    setIsDirty(true)
  }

  function updateGroup(id: string, key: keyof TaxGroup, value: unknown) {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, [key]: value } : g))
    setIsDirty(true)
  }

  function toggleGroupComponent(groupId: string, compId: string) {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      return {
        ...g,
        components: g.components.includes(compId)
          ? g.components.filter(c => c !== compId)
          : [...g.components, compId],
      }
    }))
    setIsDirty(true)
  }

  function removeGroup(id: string) {
    setGroups(prev => prev.filter(g => g.id !== id))
    setIsDirty(true)
  }

  function handleSave() {
    onSaveTaxFramework?.(selectedFrameworkId, components, groups)
    setIsDirty(false)
  }

  const selectedFrameworkMeta = taxFrameworks.find(f => f.id === selectedFrameworkId)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl px-6 py-6 space-y-8">

          {/* ── Framework Selector ── */}
          <div>
            <div className="flex items-start gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-950 flex items-center justify-center shrink-0 mt-0.5">
                <Globe className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tax Framework</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Select your country to auto-load the correct tax framework. You can customise all components and rates below.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {taxFrameworks.map(fw => {
                const isSelected = fw.id === selectedFrameworkId
                return (
                  <button
                    key={fw.id}
                    onClick={() => handleFrameworkChange(fw.id)}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-violet-500 dark:border-violet-400 bg-violet-50 dark:bg-violet-950/40 ring-1 ring-violet-500/20'
                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-violet-300 dark:hover:border-violet-600 hover:bg-violet-50/50 dark:hover:bg-violet-950/20'
                    }`}
                  >
                    <span className="text-xl leading-none mt-0.5">{COUNTRY_FLAGS[fw.country ?? 'null'] ?? '🌐'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isSelected ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-800 dark:text-zinc-200'}`}>
                          {fw.name}
                        </span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />}
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{fw.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Registration field */}
            {selectedFrameworkMeta?.registrationField && (
              <div className="mt-4 p-4 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-xl flex items-start gap-3">
                <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-teal-700 dark:text-teal-300">Registration Required</p>
                  <p className="text-xs text-teal-600/80 dark:text-teal-400/80 mt-0.5">
                    This framework requires a <strong>{selectedFrameworkMeta.registrationField}</strong>.
                    Make sure it's entered in Organisation → Tax Registration Number.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Framework Change Warning Modal ── */}
          {showFrameworkChange && (
            <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-xl max-w-sm w-full p-6">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Switch Tax Framework?</h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      Switching to <strong>{taxFrameworks.find(f => f.id === pendingFrameworkId)?.name}</strong> will replace
                      your current tax components and groups with the preset. Your custom changes will be lost.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowFrameworkChange(false)}
                    className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmFrameworkChange}
                    className="px-4 py-1.5 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
                  >
                    Switch Framework
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Tax Components ── */}
          <div>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-950 flex items-center justify-center shrink-0 mt-0.5">
                  <Layers className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tax Components</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Individual rate lines that make up your tax structure.</p>
                </div>
              </div>
              <button
                onClick={addComponent}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white rounded-lg transition-colors shadow-sm shadow-violet-600/20"
              >
                <Plus className="w-3.5 h-3.5" /> Add Component
              </button>
            </div>

            {components.length === 0 ? (
              <div className="text-center py-10 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
                <Layers className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No tax components defined.</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Select a framework above or add components manually.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {components.map(comp => (
                  <div key={comp.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_100px_100px_32px] gap-3 items-start">
                      {/* Name */}
                      <div>
                        <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Component Name</label>
                        <Input
                          value={comp.name}
                          onChange={v => updateComponent(comp.id, 'name', v)}
                          placeholder="e.g. Standard VAT"
                          className="w-full"
                        />
                      </div>
                      {/* Code */}
                      <div>
                        <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Code</label>
                        <Input
                          value={comp.code}
                          onChange={v => updateComponent(comp.id, 'code', v.toUpperCase())}
                          placeholder="VAT5"
                          className="w-full font-mono"
                        />
                      </div>
                      {/* Type */}
                      <div>
                        <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Type</label>
                        <Select
                          value={comp.type}
                          onChange={v => updateComponent(comp.id, 'type', v)}
                          options={TAX_TYPE_OPTIONS}
                        />
                      </div>
                      {/* Rate */}
                      <div>
                        <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">
                          Rate {comp.type === 'percentage' ? '(%)' : comp.type === 'fixed' ? '(Amount)' : ''}
                        </label>
                        <Input
                          type="number"
                          value={comp.type === 'exempt' ? '0' : comp.rate}
                          onChange={v => updateComponent(comp.id, 'rate', parseFloat(v) || 0)}
                          placeholder="0"
                          className={`w-full font-mono ${comp.type === 'exempt' ? 'opacity-40 pointer-events-none' : ''}`}
                        />
                      </div>
                      {/* Delete */}
                      <div className="flex items-end justify-end pb-0.5">
                        <button
                          onClick={() => removeComponent(comp.id)}
                          className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors mt-5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Applies To */}
                    <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">Applies to</p>
                      <div className="flex flex-wrap gap-1.5">
                        {APPLIES_TO_OPTIONS.map(opt => {
                          const isActive = (comp.appliesTo as TaxAppliesTo[]).includes(opt)
                          return (
                            <button
                              key={opt}
                              onClick={() => toggleComponentAppliesTo(comp.id, opt)}
                              className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                                isActive
                                  ? 'bg-teal-100 dark:bg-teal-950 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300'
                                  : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                              }`}
                            >
                              {APPLIES_TO_LABELS[opt]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Tax Groups ── */}
          <div>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-950 flex items-center justify-center shrink-0 mt-0.5">
                  <Tags className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tax Groups</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Bundle components into a single selectable code for use on invoices and purchases.
                  </p>
                </div>
              </div>
              <button
                onClick={addGroup}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 text-white rounded-lg transition-colors shadow-sm shadow-teal-600/20"
              >
                <Plus className="w-3.5 h-3.5" /> Add Group
              </button>
            </div>

            {groups.length === 0 ? (
              <div className="text-center py-10 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
                <Tags className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No tax groups defined yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map(group => {
                  const groupComponents = components.filter(c => group.components.includes(c.id))
                  const totalRate = groupComponents.reduce((sum, c) => sum + (c.type === 'percentage' ? c.rate : 0), 0)
                  return (
                    <div key={group.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              type="text"
                              value={group.name}
                              onChange={e => updateGroup(group.id, 'name', e.target.value)}
                              placeholder="Group name (e.g. Standard GST 18%)"
                              className="flex-1 px-3 py-2 text-sm font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 dark:focus:border-teal-400 transition-colors"
                            />
                            {totalRate > 0 && (
                              <Badge color="teal">{totalRate}% total</Badge>
                            )}
                            <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap cursor-pointer">
                              <input
                                type="checkbox"
                                checked={group.isDefault}
                                onChange={e => updateGroup(group.id, 'isDefault', e.target.checked)}
                                className="accent-teal-500 w-3.5 h-3.5"
                              />
                              Default
                            </label>
                          </div>

                          {/* Component checkboxes */}
                          <div className="mt-2">
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">Include components:</p>
                            {components.length === 0 ? (
                              <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">No components available. Add components above first.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {components.map(comp => {
                                  const isIncluded = group.components.includes(comp.id)
                                  return (
                                    <button
                                      key={comp.id}
                                      onClick={() => toggleGroupComponent(group.id, comp.id)}
                                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                                        isIncluded
                                          ? 'bg-teal-100 dark:bg-teal-950 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300'
                                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                                      }`}
                                    >
                                      <span className="font-mono font-medium">{comp.code || '—'}</span>
                                      {comp.type !== 'exempt' && <span className="opacity-70">{comp.rate}%</span>}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => removeGroup(group.id)}
                          className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Sticky save bar ── */}
      <div className={`shrink-0 border-t px-6 py-3 flex items-center justify-between transition-colors ${
        isDirty
          ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800'
          : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800'
      }`}>
        <p className={`text-xs transition-colors ${isDirty ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
          {isDirty ? 'You have unsaved changes' : 'All changes saved'}
        </p>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={() => {
                setSelectedFrameworkId(activeTaxFramework)
                const fw = taxFrameworks.find(f => f.id === activeTaxFramework)!
                setComponents([...fw.components])
                setGroups([...fw.groups])
                setIsDirty(false)
              }}
              className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
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
  )
}
