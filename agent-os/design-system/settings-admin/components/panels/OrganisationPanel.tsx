import { useState } from 'react'
import { Upload, Plus, Trash2, ChevronDown, Globe, Building2, FileText, Calendar, DollarSign } from 'lucide-react'
import type { Organisation, DocumentNumbering } from '../../types'

interface OrganisationPanelProps {
  organisation: Organisation
  onSave?: (data: Partial<Organisation>) => void
}

const TIMEZONES = [
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata', 'Asia/Singapore', 'Europe/London',
  'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney',
]

const CURRENCIES = [
  { code: 'AED', name: 'UAE Dirham' }, { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' }, { code: 'GBP', name: 'British Pound' },
  { code: 'INR', name: 'Indian Rupee' }, { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'SGD', name: 'Singapore Dollar' }, { code: 'QAR', name: 'Qatari Riyal' },
]

const MONTHS = [
  { value: '01', label: 'January' }, { value: '02', label: 'February' },
  { value: '03', label: 'March' }, { value: '04', label: 'April' },
  { value: '05', label: 'May' }, { value: '06', label: 'June' },
  { value: '07', label: 'July' }, { value: '08', label: 'August' },
  { value: '09', label: 'September' }, { value: '10', label: 'October' },
  { value: '11', label: 'November' }, { value: '12', label: 'December' },
]

interface FieldProps {
  label: string
  hint?: string
  children: React.ReactNode
}
function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-6 items-start py-4 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="md:pt-2">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</p>
        {hint && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{hint}</p>}
      </div>
      <div className="md:col-span-2">{children}</div>
    </div>
  )
}

function Input({ value, onChange, placeholder, className = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 dark:focus:border-violet-400 transition-colors ${className}`}
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

function SectionHeading({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 mb-1">
      <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-950 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{description}</p>
      </div>
    </div>
  )
}

export function OrganisationPanel({ organisation, onSave }: OrganisationPanelProps) {
  const [form, setForm] = useState({ ...organisation })
  const [numbering, setNumbering] = useState<DocumentNumbering[]>(organisation.documentNumbering)
  const [isDirty, setIsDirty] = useState(false)

  function set<K extends keyof Organisation>(key: K, value: Organisation[K]) {
    setForm(f => ({ ...f, [key]: value }))
    setIsDirty(true)
  }

  function setAddress(key: keyof Organisation['address'], value: string) {
    setForm(f => ({ ...f, address: { ...f.address, [key]: value } }))
    setIsDirty(true)
  }

  function updateNumbering(index: number, key: keyof DocumentNumbering, value: string | number) {
    setNumbering(prev => prev.map((item, i) => i === index ? { ...item, [key]: value } : item))
    setIsDirty(true)
  }

  function handleSave() {
    onSave?.({ ...form, documentNumbering: numbering })
    setIsDirty(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl px-6 py-6 space-y-8">

          {/* ── Brand Identity ── */}
          <div>
            <SectionHeading icon={Building2} title="Brand Identity" description="Your company name and logo appear on all documents and receipts." />
            <div className="mt-4 space-y-0 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 divide-y divide-zinc-100 dark:divide-zinc-800">
              <Field label="Logo" hint="PNG or SVG, max 2 MB">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center overflow-hidden">
                    {form.logo
                      ? <img src={form.logo} alt="Logo" className="w-full h-full object-contain p-2" />
                      : <Building2 className="w-6 h-6 text-zinc-400" />
                    }
                  </div>
                  <div className="space-y-1.5">
                    <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors">
                      <Upload className="w-3.5 h-3.5" /> Upload logo
                    </button>
                    {form.logo && (
                      <button
                        onClick={() => set('logo', '')}
                        className="block text-xs text-red-500 hover:text-red-600 dark:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </Field>
              <Field label="Company Name" hint="Legal registered name">
                <Input value={form.companyName} onChange={v => set('companyName', v)} placeholder="Malak Star Trading LLC" />
              </Field>
              <Field label="Legal Name" hint="As registered with authorities">
                <Input value={form.legalName} onChange={v => set('legalName', v)} placeholder="Malak Star Trading L.L.C." />
              </Field>
              <Field label="Trading Name" hint="Brand name used on receipts">
                <Input value={form.tradingName} onChange={v => set('tradingName', v)} placeholder="Malakstar" />
              </Field>
              <Field label="Business Type">
                <Select
                  value={form.businessType}
                  onChange={v => set('businessType', v as Organisation['businessType'])}
                  options={[
                    { value: 'retail', label: 'Retail only' },
                    { value: 'wholesale', label: 'Wholesale only' },
                    { value: 'both', label: 'Retail & Wholesale' },
                  ]}
                />
              </Field>
            </div>
          </div>

          {/* ── Registration ── */}
          <div>
            <SectionHeading icon={FileText} title="Registration & Tax" description="Business registration and tax numbers printed on official documents." />
            <div className="mt-4 space-y-0 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 divide-y divide-zinc-100 dark:divide-zinc-800">
              <Field label="Registration Number" hint="Company / trade license number">
                <Input value={form.registrationNumber} onChange={v => set('registrationNumber', v)} placeholder="CN-0000000" />
              </Field>
              <Field label="Tax Registration Number" hint="VAT / GST / TRN as applicable">
                <Input value={form.taxRegistrationNumber} onChange={v => set('taxRegistrationNumber', v)} placeholder="100000000000000" />
              </Field>
              <Field label="Primary Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="accounts@company.com"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 dark:focus:border-violet-400 transition-colors"
                />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={v => set('phone', v)} placeholder="+971 4 000 0000" />
              </Field>
              <Field label="Website">
                <Input value={form.website} onChange={v => set('website', v)} placeholder="https://yourcompany.com" />
              </Field>
            </div>
          </div>

          {/* ── Address ── */}
          <div>
            <SectionHeading icon={Globe} title="Business Address" description="Used on invoices, purchase orders, and official documents." />
            <div className="mt-4 space-y-0 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 divide-y divide-zinc-100 dark:divide-zinc-800">
              <Field label="Address Line 1">
                <Input value={form.address.line1} onChange={v => setAddress('line1', v)} placeholder="Street address, building, floor" />
              </Field>
              <Field label="Address Line 2">
                <Input value={form.address.line2} onChange={v => setAddress('line2', v)} placeholder="Apartment, suite, unit (optional)" />
              </Field>
              <Field label="City">
                <Input value={form.address.city} onChange={v => setAddress('city', v)} placeholder="City" />
              </Field>
              <Field label="State / Emirate">
                <Input value={form.address.state} onChange={v => setAddress('state', v)} placeholder="State or region" />
              </Field>
              <Field label="Country">
                <Input value={form.countryName} onChange={v => set('countryName', v)} placeholder="Country" />
              </Field>
              <Field label="Postal / ZIP Code">
                <Input value={form.address.postalCode} onChange={v => setAddress('postalCode', v)} placeholder="Postal code (if applicable)" />
              </Field>
            </div>
          </div>

          {/* ── Fiscal & Operational ── */}
          <div>
            <SectionHeading icon={Calendar} title="Fiscal & Operational" description="Controls accounting periods, currency, time zone, and date formatting." />
            <div className="mt-4 space-y-0 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 divide-y divide-zinc-100 dark:divide-zinc-800">
              <Field label="Fiscal Year Start" hint="First month of your accounting year">
                <Select
                  value={form.fiscalYearStart}
                  onChange={v => set('fiscalYearStart', v)}
                  options={MONTHS}
                  className="w-48"
                />
              </Field>
              <Field label="Base Currency" hint="Cannot be changed after first transaction">
                <Select
                  value={form.baseCurrency}
                  onChange={v => set('baseCurrency', v)}
                  options={CURRENCIES.map(c => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                  className="w-64"
                />
              </Field>
              <Field label="Time Zone">
                <Select
                  value={form.timezone}
                  onChange={v => set('timezone', v)}
                  options={TIMEZONES.map(tz => ({ value: tz, label: tz.replace('_', ' ') }))}
                  className="w-64"
                />
              </Field>
              <Field label="Date Format">
                <Select
                  value={form.dateFormat}
                  onChange={v => set('dateFormat', v)}
                  options={[
                    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (31/12/2026)' },
                    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (12/31/2026)' },
                    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2026-12-31)' },
                    { value: 'DD-MMM-YYYY', label: 'DD-MMM-YYYY (31-Dec-2026)' },
                  ]}
                  className="w-64"
                />
              </Field>
              <Field label="Paper Size" hint="Default for printed documents">
                <Select
                  value={form.paperSize}
                  onChange={v => set('paperSize', v as Organisation['paperSize'])}
                  options={[
                    { value: 'A4', label: 'A4 (210 × 297 mm)' },
                    { value: 'Letter', label: 'Letter (8.5 × 11 in)' },
                    { value: 'thermal_80mm', label: 'Thermal 80mm (POS receipts)' },
                  ]}
                  className="w-64"
                />
              </Field>
              <Field label="Number Format">
                <div className="flex items-center gap-3">
                  <div className="space-y-1 w-40">
                    <label className="text-xs text-zinc-500 dark:text-zinc-400">Decimal separator</label>
                    <Select
                      value={form.numberFormat.decimalSeparator}
                      onChange={v => set('numberFormat', { ...form.numberFormat, decimalSeparator: v })}
                      options={[{ value: '.', label: 'Period  (1,234.56)' }, { value: ',', label: 'Comma  (1.234,56)' }]}
                    />
                  </div>
                </div>
              </Field>
            </div>
          </div>

          {/* ── Document Numbering ── */}
          <div>
            <SectionHeading icon={DollarSign} title="Document Numbering" description="Configure auto-numbering sequences for all transaction documents." />
            <div className="mt-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_80px_80px_80px_100px] gap-2 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                {['Document Type', 'Prefix', 'Suffix', 'Padding', 'Next Number'].map(h => (
                  <span key={h} className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{h}</span>
                ))}
              </div>
              {/* Table rows */}
              {numbering.map((item, i) => (
                <div key={item.type} className="grid grid-cols-[1fr_80px_80px_80px_100px] gap-2 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0 items-center">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{item.type}</span>
                  <input
                    value={item.prefix}
                    onChange={e => updateNumbering(i, 'prefix', e.target.value)}
                    className="px-2 py-1.5 text-xs font-mono bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500 transition-colors w-full"
                  />
                  <input
                    value={item.suffix}
                    onChange={e => updateNumbering(i, 'suffix', e.target.value)}
                    placeholder="—"
                    className="px-2 py-1.5 text-xs font-mono bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500 transition-colors w-full"
                  />
                  <input
                    type="number"
                    value={item.padding}
                    onChange={e => updateNumbering(i, 'padding', parseInt(e.target.value))}
                    min={1}
                    max={9}
                    className="px-2 py-1.5 text-xs font-mono bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500 transition-colors w-full"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono text-teal-600 dark:text-teal-400">
                      {item.prefix}{String(item.nextNumber).padStart(item.padding, '0')}{item.suffix}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 px-1">
              Preview shows how the next document number will appear. Padding adds leading zeros.
            </p>
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
              onClick={() => { setForm({ ...organisation }); setNumbering(organisation.documentNumbering); setIsDirty(false) }}
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
