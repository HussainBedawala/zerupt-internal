import { useState } from 'react'
import { Plus, MoreHorizontal, X, ChevronDown, Star, Archive } from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────

type PriceListType = 'retail' | 'wholesale' | 'promotional'
type PriceListStatus = 'active' | 'archived'

interface PriceList {
  id: string
  name: string
  type: PriceListType
  currency: string
  isDefault: boolean
  description: string
  itemCount: number
  status: PriceListStatus
}

interface PriceListsPanelProps {
  onSavePriceList?: (priceList: any) => void
  onArchivePriceList?: (id: string) => void
}

// ─── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_PRICE_LISTS: PriceList[] = [
  { id: 'pl_001', name: 'Retail Price', type: 'retail', currency: 'AED', isDefault: true, description: 'Standard retail pricing for walk-in customers.', itemCount: 1240, status: 'active' },
  { id: 'pl_002', name: 'Wholesale Price', type: 'wholesale', currency: 'AED', isDefault: false, description: 'Discounted pricing for wholesale and bulk buyers.', itemCount: 1240, status: 'active' },
  { id: 'pl_003', name: 'VIP Members', type: 'promotional', currency: 'AED', isDefault: false, description: 'Special rates for loyalty program members.', itemCount: 340, status: 'active' },
  { id: 'pl_004', name: 'Export — USD', type: 'wholesale', currency: 'USD', isDefault: false, description: 'USD-denominated pricing for international wholesale orders.', itemCount: 980, status: 'active' },
  { id: 'pl_005', name: 'Seasonal Promo Q1', type: 'promotional', currency: 'AED', isDefault: false, description: 'Q1 promotional discounts. Active January to March.', itemCount: 125, status: 'archived' },
]

// ─── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: PriceListType }) {
  const styles: Record<PriceListType, string> = {
    retail: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300',
    wholesale: 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300',
    promotional: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
  }
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${styles[type]}`}>
      {type}
    </span>
  )
}

// ─── Action menu ───────────────────────────────────────────────────────────────

interface ActionMenuProps {
  priceList: PriceList
  onEdit: () => void
  onSetDefault: () => void
  onArchive: () => void
  onUnarchive: () => void
}

function ActionMenu({ priceList, onEdit, onSetDefault, onArchive, onUnarchive }: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(!open) }}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-44 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg py-1 overflow-hidden">
            <button onClick={() => { onEdit(); setOpen(false) }} className="w-full text-left px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors">
              Edit
            </button>
            {!priceList.isDefault && priceList.status === 'active' && (
              <button onClick={() => { onSetDefault(); setOpen(false) }} className="w-full text-left px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors flex items-center gap-2">
                <Star className="w-3 h-3" /> Set as Default
              </button>
            )}
            {priceList.status === 'active' ? (
              <button onClick={() => { onArchive(); setOpen(false) }} className="w-full text-left px-3 py-2 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors flex items-center gap-2">
                <Archive className="w-3 h-3" /> Archive
              </button>
            ) : (
              <button onClick={() => { onUnarchive(); setOpen(false) }} className="w-full text-left px-3 py-2 text-xs text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors flex items-center gap-2">
                <Archive className="w-3 h-3" /> Unarchive
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Price list card ───────────────────────────────────────────────────────────

interface PriceListCardProps {
  pl: PriceList
  onEdit: () => void
  onSetDefault: () => void
  onArchive: () => void
  onUnarchive: () => void
}

function PriceListCard({ pl, onEdit, onSetDefault, onArchive, onUnarchive }: PriceListCardProps) {
  const isArchived = pl.status === 'archived'
  return (
    <div className={`bg-white dark:bg-zinc-900 rounded-xl border p-4 transition-all ${
      isArchived
        ? 'border-zinc-200 dark:border-zinc-800 opacity-50'
        : pl.isDefault
        ? 'border-violet-300 dark:border-violet-700'
        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold text-zinc-900 dark:text-zinc-100 ${isArchived ? 'line-through text-zinc-500 dark:text-zinc-500' : ''}`}>
              {pl.name}
            </span>
            {pl.isDefault && (
              <span className="px-2 py-0.5 text-xs font-semibold bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 rounded-full flex items-center gap-1">
                <Star className="w-2.5 h-2.5" /> Default
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">{pl.description}</p>
        </div>
        <ActionMenu
          priceList={pl}
          onEdit={onEdit}
          onSetDefault={onSetDefault}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <TypeBadge type={pl.type} />
        <span className="px-2 py-0.5 text-xs font-mono font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full">
          {pl.currency}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-auto">
          {pl.itemCount.toLocaleString()} items
        </span>
      </div>
    </div>
  )
}

// ─── Create / Edit modal ───────────────────────────────────────────────────────

interface ModalProps {
  initial?: Partial<PriceList>
  onSave: (data: Partial<PriceList>) => void
  onClose: () => void
}

function PriceListModal({ initial, onSave, onClose }: ModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<PriceListType>(initial?.type ?? 'retail')
  const [currency, setCurrency] = useState(initial?.currency ?? 'AED')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false)

  const isValid = name.trim().length > 0

  const inputCls = 'w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors'
  const selectCls = 'appearance-none ' + inputCls + ' pr-8'

  function handleSave() {
    if (!isValid) return
    onSave({ ...initial, name: name.trim(), type, currency, description, isDefault })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {initial?.id ? 'Edit Price List' : 'New Price List'}
          </h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 block">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Wholesale AED" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 block">Type</label>
              <div className="relative">
                <select value={type} onChange={e => setType(e.target.value as PriceListType)} className={selectCls}>
                  <option value="retail">Retail</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="promotional">Promotional</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 block">Currency</label>
              <div className="relative">
                <select value={currency} onChange={e => setCurrency(e.target.value)} className={selectCls}>
                  {['AED', 'USD', 'EUR', 'GBP', 'INR'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description of this price list..."
              className={inputCls + ' resize-none'}
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              className="accent-violet-600 w-4 h-4"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">Set as default for {currency}</span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${
              isValid
                ? 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white shadow-sm shadow-violet-600/20'
                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
            }`}
          >
            {initial?.id ? 'Save Changes' : 'Create Price List'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PriceListsPanel({ onSavePriceList, onArchivePriceList }: PriceListsPanelProps) {
  const [lists, setLists] = useState<PriceList[]>(SAMPLE_PRICE_LISTS)
  const [modalFor, setModalFor] = useState<PriceList | 'new' | null>(null)

  function handleSave(data: Partial<PriceList>) {
    if (data.id) {
      setLists(prev => prev.map(pl => pl.id === data.id ? { ...pl, ...data } as PriceList : pl))
    } else {
      const newPl: PriceList = {
        id: `pl_${Date.now()}`,
        name: data.name ?? '',
        type: data.type ?? 'retail',
        currency: data.currency ?? 'AED',
        isDefault: data.isDefault ?? false,
        description: data.description ?? '',
        itemCount: 0,
        status: 'active',
      }
      if (newPl.isDefault) {
        setLists(prev => [...prev.map(pl => pl.currency === newPl.currency ? { ...pl, isDefault: false } : pl), newPl])
      } else {
        setLists(prev => [...prev, newPl])
      }
    }
    onSavePriceList?.(data)
    setModalFor(null)
  }

  function handleSetDefault(id: string) {
    setLists(prev => {
      const target = prev.find(pl => pl.id === id)
      if (!target) return prev
      return prev.map(pl => ({
        ...pl,
        isDefault: pl.currency === target.currency ? pl.id === id : pl.isDefault,
      }))
    })
  }

  function handleArchive(id: string) {
    setLists(prev => prev.map(pl => pl.id === id ? { ...pl, status: 'archived' as PriceListStatus, isDefault: false } : pl))
    onArchivePriceList?.(id)
  }

  function handleUnarchive(id: string) {
    setLists(prev => prev.map(pl => pl.id === id ? { ...pl, status: 'active' as PriceListStatus } : pl))
  }

  const active = lists.filter(pl => pl.status === 'active')
  const archived = lists.filter(pl => pl.status === 'archived')

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">

      {/* ── Active price lists ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Price Lists</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Define pricing structures for different customer segments.</p>
          </div>
          <button
            onClick={() => setModalFor('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white rounded-lg transition-colors shadow-sm shadow-violet-600/20"
          >
            <Plus className="w-4 h-4" /> New Price List
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
          {active.map(pl => (
            <PriceListCard
              key={pl.id}
              pl={pl}
              onEdit={() => setModalFor(pl)}
              onSetDefault={() => handleSetDefault(pl.id)}
              onArchive={() => handleArchive(pl.id)}
              onUnarchive={() => handleUnarchive(pl.id)}
            />
          ))}

          {/* New price list dashed card */}
          <button
            onClick={() => setModalFor('new')}
            className="rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 hover:border-violet-300 dark:hover:border-violet-700 text-zinc-400 dark:text-zinc-500 hover:text-violet-500 dark:hover:text-violet-400 p-4 flex items-center justify-center gap-2 transition-all min-h-[120px]"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">New Price List</span>
          </button>
        </div>
      </section>

      {/* ── Archived price lists ── */}
      {archived.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Archived</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
            {archived.map(pl => (
              <PriceListCard
                key={pl.id}
                pl={pl}
                onEdit={() => setModalFor(pl)}
                onSetDefault={() => handleSetDefault(pl.id)}
                onArchive={() => handleArchive(pl.id)}
                onUnarchive={() => handleUnarchive(pl.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Modal */}
      {modalFor !== null && (
        <PriceListModal
          initial={modalFor === 'new' ? undefined : modalFor}
          onSave={handleSave}
          onClose={() => setModalFor(null)}
        />
      )}
    </div>
  )
}
