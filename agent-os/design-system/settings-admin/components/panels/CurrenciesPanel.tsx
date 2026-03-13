import { useState } from 'react'
import { Plus, ChevronDown, Check, ToggleLeft, ToggleRight, Clock } from 'lucide-react'
import type { Currency, ExchangeRate } from '../../types'

interface CurrenciesPanelProps {
  currencies: Currency[]
  baseCurrency: string
  exchangeRateHistory: ExchangeRate[]
  onToggleCurrency?: (code: string, enabled: boolean) => void
  onAddExchangeRate?: (currencyCode: string, rate: number, effectiveDate: string) => void
}

// ─── Flag emoji helper ─────────────────────────────────────────────────────────

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', AED: '🇦🇪', SAR: '🇸🇦',
  INR: '🇮🇳', PKR: '🇵🇰', EGP: '🇪🇬', JPY: '🇯🇵', CNY: '🇨🇳',
  CAD: '🇨🇦', AUD: '🇦🇺', CHF: '🇨🇭', SGD: '🇸🇬', MYR: '🇲🇾',
  QAR: '🇶🇦', KWD: '🇰🇼', BHD: '🇧🇭', OMR: '🇴🇲', JOD: '🇯🇴',
}

function flagFor(code: string): string {
  return CURRENCY_FLAGS[code] ?? '💱'
}

// ─── Currency card ─────────────────────────────────────────────────────────────

interface CurrencyCardProps {
  currency: Currency
  baseCurrency: string
  onToggle?: (code: string, enabled: boolean) => void
}

function CurrencyCard({ currency, baseCurrency, onToggle }: CurrencyCardProps) {
  const isBase = currency.code === baseCurrency

  return (
    <div className={`bg-white dark:bg-zinc-900 rounded-xl border p-4 transition-all ${
      isBase
        ? 'border-violet-300 dark:border-violet-700 shadow-sm shadow-violet-100 dark:shadow-violet-950/30'
        : currency.isEnabled
        ? 'border-teal-200 dark:border-teal-800/60'
        : 'border-zinc-200 dark:border-zinc-800 opacity-60'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none">{flagFor(currency.code)}</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{currency.code}</span>
              {isBase && (
                <span className="px-2 py-0.5 text-xs font-semibold bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 rounded-full">
                  Base Currency
                </span>
              )}
              {!isBase && currency.isEnabled && (
                <span className="px-2 py-0.5 text-xs bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 rounded-full">
                  Enabled
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{currency.name}</p>
          </div>
        </div>

        {!isBase && (
          <button
            onClick={() => onToggle?.(currency.code, !currency.isEnabled)}
            className="shrink-0 transition-colors"
            aria-label={currency.isEnabled ? 'Disable currency' : 'Enable currency'}
          >
            {currency.isEnabled ? (
              <ToggleRight className="w-7 h-7 text-teal-500 dark:text-teal-400" />
            ) : (
              <ToggleLeft className="w-7 h-7 text-zinc-300 dark:text-zinc-600" />
            )}
          </button>
        )}
      </div>

      {!isBase && (
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <p className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
            1 {currency.code} = <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{currency.rate.toFixed(4)}</span> {baseCurrency}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Add rate form ─────────────────────────────────────────────────────────────

interface AddRateFormProps {
  currencyCode: string
  onConfirm: (rate: number, date: string) => void
  onCancel: () => void
}

function AddRateForm({ currencyCode, onConfirm, onCancel }: AddRateFormProps) {
  const today = new Date().toISOString().split('T')[0]
  const [rate, setRate] = useState('')
  const [date, setDate] = useState(today)

  const isValid = !!rate && parseFloat(rate) > 0 && !!date

  return (
    <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-xl p-4 mb-4">
      <h4 className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wide mb-3">Add Exchange Rate for {currencyCode}</h4>
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Effective Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Rate (1 {currencyCode} = ? base)</label>
          <input
            type="number"
            step="0.0001"
            min="0"
            value={rate}
            onChange={e => setRate(e.target.value)}
            placeholder="0.0000"
            className="px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 font-mono placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors w-40"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => isValid && onConfirm(parseFloat(rate), date)}
            disabled={!isValid}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              isValid
                ? 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white shadow-sm shadow-violet-600/20'
                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
            }`}
          >
            <Check className="w-3.5 h-3.5" /> Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Rate history table ────────────────────────────────────────────────────────

interface RateHistoryProps {
  currencyCode: string
  rates: ExchangeRate[]
  onAddRate?: (code: string, rate: number, date: string) => void
}

function RateHistory({ currencyCode, rates, onAddRate }: RateHistoryProps) {
  const [showForm, setShowForm] = useState(false)
  const sorted = [...rates].sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime())
  const mostRecentId = sorted[0]?.id

  function handleConfirm(rate: number, date: string) {
    onAddRate?.(currencyCode, rate, date)
    setShowForm(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-400" />
          Rate History for {currencyCode}
        </h4>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Rate
        </button>
      </div>

      {showForm && (
        <AddRateForm
          currencyCode={currencyCode}
          onConfirm={handleConfirm}
          onCancel={() => setShowForm(false)}
        />
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-6">No rates recorded for {currencyCode}.</p>
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
            {['Date', 'Rate', 'Source', ''].map((h, i) => (
              <span key={i} className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{h}</span>
            ))}
          </div>

          {sorted.map(entry => (
            <div
              key={entry.id}
              className={`grid grid-cols-[1fr_1fr_auto_auto] gap-3 px-4 py-3 items-center border-b border-zinc-100 dark:border-zinc-800 last:border-0 ${
                entry.id === mostRecentId ? 'bg-teal-50/50 dark:bg-teal-950/10' : ''
              }`}
            >
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {new Date(entry.effectiveDate).toLocaleDateString()}
              </span>
              <span className="text-sm font-mono text-zinc-800 dark:text-zinc-200">{entry.rate.toFixed(4)}</span>
              <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                entry.source === 'auto'
                  ? 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
              }`}>
                {entry.source}
              </span>
              <div>
                {entry.id === mostRecentId && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 rounded-full">
                    Current
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function CurrenciesPanel({
  currencies,
  baseCurrency,
  exchangeRateHistory,
  onToggleCurrency,
  onAddExchangeRate,
}: CurrenciesPanelProps) {
  const nonBaseCurrencies = currencies.filter(c => c.code !== baseCurrency)
  const [selectedCurrencyForHistory, setSelectedCurrencyForHistory] = useState<string>(
    nonBaseCurrencies[0]?.code ?? ''
  )

  const historyForSelected = exchangeRateHistory.filter(r => r.currency === selectedCurrencyForHistory)

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">

      {/* ── Section 1: Currencies ── */}
      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Currencies</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Enable the currencies your business operates in.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
          {/* Base currency first */}
          {currencies.filter(c => c.code === baseCurrency).map(c => (
            <CurrencyCard
              key={c.code}
              currency={c}
              baseCurrency={baseCurrency}
              onToggle={onToggleCurrency}
            />
          ))}
          {/* Remaining */}
          {currencies.filter(c => c.code !== baseCurrency).map(c => (
            <CurrencyCard
              key={c.code}
              currency={c}
              baseCurrency={baseCurrency}
              onToggle={onToggleCurrency}
            />
          ))}
        </div>
      </section>

      {/* ── Section 2: Exchange rate history ── */}
      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Exchange Rate History</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">View and manage historical exchange rates per currency.</p>
        </div>

        <div className="max-w-3xl space-y-4">
          {/* Currency selector */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">Currency</label>
            <div className="relative w-48">
              <select
                value={selectedCurrencyForHistory}
                onChange={e => setSelectedCurrencyForHistory(e.target.value)}
                className="appearance-none w-full px-3 py-2 pr-8 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
              >
                {nonBaseCurrencies.map(c => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            </div>
          </div>

          {selectedCurrencyForHistory ? (
            <RateHistory
              currencyCode={selectedCurrencyForHistory}
              rates={historyForSelected}
              onAddRate={onAddExchangeRate}
            />
          ) : (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">No non-base currencies available.</p>
          )}
        </div>
      </section>

      {/* ── Note ── */}
      <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-2xl border-t border-zinc-200 dark:border-zinc-800 pt-4">
        Base currency ({baseCurrency}) cannot be changed after the first transaction is recorded.
      </p>
    </div>
  )
}
