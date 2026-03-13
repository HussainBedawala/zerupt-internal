import { useState } from 'react'
import { Globe, Calendar, FileText, Hash } from 'lucide-react'
import type { Organisation } from '../../types'

interface AppearancePanelProps {
  organisation: Organisation
  onSaveOrganisation?: (data: Partial<Organisation>) => void
}

// ─── Radio card ────────────────────────────────────────────────────────────────

function RadioCard({
  checked,
  onClick,
  children,
}: {
  checked: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex-1 px-3 py-2.5 rounded-xl border text-left transition-all ${
        checked
          ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 ring-1 ring-violet-400/20'
          : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-violet-300 dark:hover:border-violet-700'
      }`}
    >
      {checked && (
        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-violet-600 dark:bg-violet-500 flex items-center justify-center">
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
        </span>
      )}
      {children}
    </button>
  )
}

// ─── Settings section wrapper ─────────────────────────────────────────────────

function Section({ icon: Icon, title, children }: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
        <Icon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
        <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="px-4 py-4 space-y-5">{children}</div>
    </div>
  )
}

// ─── Field row ─────────────────────────────────────────────────────────────────

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-8">
      <div className="shrink-0 sm:w-36">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
        {hint && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

// ─── Preview pill ──────────────────────────────────────────────────────────────

function PreviewPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 mt-2 text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 px-2.5 py-1 rounded-lg font-mono">
      Preview: <strong>{label}</strong>
    </span>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

const TIMEZONES = [
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GMT+4)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (GMT+3)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (GMT+5:30)' },
  { value: 'Europe/London', label: 'Europe/London (GMT+0)' },
  { value: 'America/New_York', label: 'America/New_York (GMT-5)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (GMT-8)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (GMT+8)' },
]

export function AppearancePanel({ organisation, onSaveOrganisation }: AppearancePanelProps) {
  const [lang, setLang] = useState(organisation.language)
  const [dateFormat, setDateFormat] = useState(organisation.dateFormat)
  const [paperSize, setPaperSize] = useState(organisation.paperSize)
  const [decimalSep, setDecimalSep] = useState(organisation.numberFormat.decimalSeparator)
  const [thousandsSep, setThousandsSep] = useState(organisation.numberFormat.thousandsSeparator)
  const [timezone, setTimezone] = useState(organisation.timezone)

  const dirty =
    lang !== organisation.language ||
    dateFormat !== organisation.dateFormat ||
    paperSize !== organisation.paperSize ||
    decimalSep !== organisation.numberFormat.decimalSeparator ||
    thousandsSep !== organisation.numberFormat.thousandsSeparator ||
    timezone !== organisation.timezone

  function save() {
    onSaveOrganisation?.({
      language: lang,
      dateFormat,
      paperSize,
      numberFormat: { decimalSeparator: decimalSep, thousandsSeparator: thousandsSep },
      timezone,
    })
  }

  function discard() {
    setLang(organisation.language)
    setDateFormat(organisation.dateFormat)
    setPaperSize(organisation.paperSize)
    setDecimalSep(organisation.numberFormat.decimalSeparator)
    setThousandsSep(organisation.numberFormat.thousandsSeparator)
    setTimezone(organisation.timezone)
  }

  // Live previews
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const previewDate = dateFormat
    .replace('DD', pad(today.getDate()))
    .replace('MM', pad(today.getMonth() + 1))
    .replace('YYYY', String(today.getFullYear()))

  const sampleNumber = 1234567.89
  const previewNumber = sampleNumber
    .toFixed(2)
    .replace('.', '__DEC__')
    .replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep || '')
    .replace('__DEC__', decimalSep)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl space-y-4">

          {/* Language & Time Zone */}
          <Section icon={Globe} title="Language & Time Zone">
            <FieldRow label="Interface language" hint="Changes layout direction">
              <div className="flex gap-2">
                <RadioCard checked={lang === 'en'} onClick={() => setLang('en')}>
                  <p className={`text-sm font-medium ${lang === 'en' ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-300'}`}>English</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Left-to-right</p>
                </RadioCard>
                <RadioCard checked={lang === 'ar'} onClick={() => setLang('ar')}>
                  <p className={`text-sm font-medium ${lang === 'ar' ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-300'}`}>العربية</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">يمين إلى يسار</p>
                </RadioCard>
              </div>
              {lang === 'ar' && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  ⚠ Switching to Arabic enables full RTL layout across the application.
                </p>
              )}
            </FieldRow>

            <FieldRow label="Time zone">
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="w-full appearance-none px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </FieldRow>
          </Section>

          {/* Date & Number formats */}
          <Section icon={Calendar} title="Date & Number Format">
            <FieldRow label="Date format">
              <div className="flex gap-2 flex-wrap">
                {(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const).map(fmt => (
                  <RadioCard key={fmt} checked={dateFormat === fmt} onClick={() => setDateFormat(fmt)}>
                    <p className={`text-xs font-mono font-medium ${dateFormat === fmt ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-300'}`}>
                      {fmt}
                    </p>
                  </RadioCard>
                ))}
              </div>
              <PreviewPill label={previewDate} />
            </FieldRow>

            <FieldRow label="Number format">
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="text-xs text-zinc-400 dark:text-zinc-500 mb-1 block">Thousands separator</label>
                  <select
                    value={thousandsSep}
                    onChange={e => setThousandsSep(e.target.value)}
                    className="appearance-none px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
                  >
                    <option value=",">, comma</option>
                    <option value=".">. period</option>
                    <option value=" ">  space</option>
                    <option value="">None</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 dark:text-zinc-500 mb-1 block">Decimal separator</label>
                  <select
                    value={decimalSep}
                    onChange={e => setDecimalSep(e.target.value)}
                    className="appearance-none px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
                  >
                    <option value=".">. period</option>
                    <option value=",">, comma</option>
                  </select>
                </div>
              </div>
              <PreviewPill label={previewNumber} />
            </FieldRow>
          </Section>

          {/* Document settings */}
          <Section icon={FileText} title="Document Settings">
            <FieldRow label="Paper size" hint="Used for printed invoices & reports">
              <div className="flex gap-2">
                <RadioCard checked={paperSize === 'A4'} onClick={() => setPaperSize('A4')}>
                  <p className={`text-sm font-medium ${paperSize === 'A4' ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-300'}`}>A4</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">210 × 297 mm</p>
                </RadioCard>
                <RadioCard checked={paperSize === 'Letter'} onClick={() => setPaperSize('Letter')}>
                  <p className={`text-sm font-medium ${paperSize === 'Letter' ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-300'}`}>Letter</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">216 × 279 mm</p>
                </RadioCard>
                <RadioCard checked={paperSize === 'thermal_80mm'} onClick={() => setPaperSize('thermal_80mm')}>
                  <p className={`text-sm font-medium ${paperSize === 'thermal_80mm' ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-300'}`}>Thermal</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">80mm POS</p>
                </RadioCard>
              </div>
            </FieldRow>
          </Section>

          {/* Number formatting reference card */}
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-4 h-4 text-zinc-400" />
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Format reference</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Sample number', value: previewNumber },
                { label: "Today's date", value: previewDate },
                { label: 'Language', value: lang === 'en' ? 'English (LTR)' : 'Arabic (RTL)' },
                { label: 'Time zone', value: TIMEZONES.find(t => t.value === timezone)?.label.split(' ')[0] ?? timezone },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">{label}</p>
                  <p className="text-sm font-mono font-medium text-zinc-700 dark:text-zinc-300 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
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
