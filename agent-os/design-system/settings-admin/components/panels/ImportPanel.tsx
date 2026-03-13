import { useState } from 'react'
import {
  Upload, Download, CheckCircle2, XCircle, Clock,
  FileText, AlertTriangle, X, ArrowRight,
} from 'lucide-react'
import type { ImportJob, ImportEntity } from '../../types'

interface ImportPanelProps {
  importJobs: ImportJob[]
  onStartImport?: (entity: ImportEntity, file: File) => void
}

// ─── Import entity catalogue ───────────────────────────────────────────────────

const IMPORT_ENTITIES: { value: ImportEntity; label: string; description: string; icon: string }[] = [
  { value: 'Item', label: 'Items / Products', description: 'Product catalogue with barcodes, prices, and categories.', icon: '📦' },
  { value: 'Customer', label: 'Customers', description: 'Customer accounts with contacts and payment terms.', icon: '🤝' },
  { value: 'Supplier', label: 'Suppliers', description: 'Supplier records with lead times and payment terms.', icon: '🏭' },
  { value: 'OpeningStock', label: 'Opening Stock', description: 'Initial stock quantities per item per warehouse.', icon: '📊' },
  { value: 'ChartOfAccounts', label: 'Chart of Accounts', description: 'Account hierarchy for the general ledger.', icon: '📒' },
  { value: 'OpeningBalances', label: 'Opening Balances', description: 'Opening debit/credit balances for each account.', icon: '💰' },
]

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ImportJob['status'] }) {
  const map: Record<ImportJob['status'], { style: string; icon: React.ReactNode; label: string }> = {
    pending: { style: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400', icon: <Clock className="w-3 h-3" />, label: 'Pending' },
    processing: { style: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300', icon: <Clock className="w-3 h-3" />, label: 'Processing' },
    completed: { style: 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300', icon: <CheckCircle2 className="w-3 h-3" />, label: 'Completed' },
    failed: { style: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300', icon: <XCircle className="w-3 h-3" />, label: 'Failed' },
  }
  const { style, icon, label } = map[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {icon} {label}
    </span>
  )
}

// ─── Import wizard ─────────────────────────────────────────────────────────────

type WizardStep = 'entity' | 'upload' | 'preview' | 'result'
const WIZARD_STEPS: WizardStep[] = ['entity', 'upload', 'preview', 'result']
const WIZARD_LABELS = ['Choose type', 'Upload file', 'Preview', 'Results']

interface ImportWizardProps {
  onClose: () => void
  onStartImport?: (entity: ImportEntity, file: File) => void
}

function ImportWizard({ onClose, onStartImport }: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('entity')
  const [entity, setEntity] = useState<ImportEntity | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)

  const stepIndex = WIZARD_STEPS.indexOf(step)

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.[0]) setFile(e.target.files[0])
  }

  function handleImport() {
    if (entity && file) {
      onStartImport?.(entity, file)
      setStep('result')
    }
  }

  function next() {
    if (step === 'preview') {
      handleImport()
    } else {
      setStep(WIZARD_STEPS[stepIndex + 1])
    }
  }

  function back() {
    if (step === 'entity') onClose()
    else setStep(WIZARD_STEPS[stepIndex - 1])
  }

  const canProceed =
    (step === 'entity' && entity !== null) ||
    (step === 'upload' && file !== null) ||
    step === 'preview'

  // Simulated preview data
  const previewData = entity === 'Item'
    ? { cols: ['Barcode', 'Name', 'Category', 'Cost (AED)', 'Price (AED)'], rows: [['123456789', 'Leather Wallet', 'Accessories', '45.00', '89.00'], ['987654321', 'Canvas Backpack', 'Bags', '120.00', '249.00'], ['111222333', 'Silver Bracelet', 'Jewelry', '85.00', '175.00']] }
    : { cols: ['Code', 'Name', 'Email', 'Phone', 'Balance'], rows: [['C001', 'Al Barsha Electronics', 'info@abe.ae', '+971 4 111 2222', '0.00'], ['C002', 'Gulf Trading Group', 'accounts@gtg.ae', '+971 2 333 4444', '0.00']] }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Data Import Wizard</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            {WIZARD_STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2 flex-1 last:flex-none">
                <div className={`flex items-center gap-2 ${i <= stepIndex ? 'opacity-100' : 'opacity-40'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                    i < stepIndex
                      ? 'bg-teal-500 text-white'
                      : i === stepIndex
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                  }`}>
                    {i < stepIndex ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${
                    i === stepIndex ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500'
                  }`}>
                    {WIZARD_LABELS[i]}
                  </span>
                </div>
                {i < WIZARD_STEPS.length - 1 && (
                  <div className={`flex-1 h-px min-w-4 transition-colors ${
                    i < stepIndex ? 'bg-teal-400' : 'bg-zinc-200 dark:bg-zinc-700'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Step 1 — Choose entity */}
          {step === 'entity' && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">
                Select the type of data you want to import into the system.
              </p>
              {IMPORT_ENTITIES.map(e => (
                <button
                  key={e.value}
                  onClick={() => setEntity(e.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                    entity === e.value
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 ring-1 ring-violet-400/20'
                      : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/30 hover:border-violet-300 dark:hover:border-violet-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-base">{e.icon}</span>
                      <div>
                        <p className={`text-sm font-medium ${
                          entity === e.value ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-800 dark:text-zinc-200'
                        }`}>
                          {e.label}
                        </p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{e.description}</p>
                      </div>
                    </div>
                    {entity === e.value && (
                      <CheckCircle2 className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Step 2 — Upload file */}
          {step === 'upload' && entity && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Uploading: <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {IMPORT_ENTITIES.find(e => e.value === entity)?.label}
                  </span>
                </p>
                <button className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors">
                  <Download className="w-3.5 h-3.5" /> Download template
                </button>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleFileDrop}
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-all ${
                  dragging
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
                    : file
                    ? 'border-teal-400 bg-teal-50 dark:bg-teal-950/30'
                    : 'border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800/30 hover:border-violet-400 dark:hover:border-violet-600'
                }`}
              >
                {file ? (
                  <div>
                    <CheckCircle2 className="w-10 h-10 text-teal-500 mx-auto mb-3" />
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{file.name}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                    <button
                      onClick={() => setFile(null)}
                      className="text-xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400 mt-2 transition-colors"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Drag & drop your CSV or Excel file here</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 mb-3">or</p>
                    <label className="inline-block cursor-pointer">
                      <span className="text-xs font-medium px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 hover:border-violet-400 dark:hover:border-violet-600 transition-colors">
                        Browse files
                      </span>
                      <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
                    </label>
                  </>
                )}
              </div>

              {file && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                    The file will be validated before import. You'll see a preview and can confirm or cancel before any data is changed.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Preview — first {previewData.rows.length} rows of <span className="font-medium text-zinc-700 dark:text-zinc-300">{file?.name}</span>
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> No validation errors
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                      {previewData.cols.map(col => (
                        <th key={col} className="text-left px-3 py-2 text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-wide whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {previewData.rows.map((row, i) => (
                      <tr key={i} className="bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                        {row.map((val, j) => (
                          <td key={j} className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Showing {previewData.rows.length} of {entity === 'Item' ? '1,240' : '387'} rows · 0 validation errors · Ready to import
              </p>
            </div>
          )}

          {/* Step 4 — Result */}
          {step === 'result' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-teal-100 dark:bg-teal-950 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-teal-600 dark:text-teal-400" />
              </div>
              <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Import complete</h4>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
                <span className="text-teal-600 dark:text-teal-400 font-semibold">1,238</span> rows imported successfully.{' '}
                <span className="text-red-500 dark:text-red-400 font-semibold">2</span> rows had errors.
              </p>
              <button className="mt-4 text-xs text-zinc-400 dark:text-zinc-500 underline hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                Download error report
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-zinc-100 dark:border-zinc-800 px-6 py-4 flex items-center justify-between bg-white dark:bg-zinc-900">
          <button
            onClick={back}
            className="px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            {step === 'entity' ? 'Cancel' : '← Back'}
          </button>

          {step === 'result' ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white rounded-xl transition-colors shadow-sm shadow-violet-600/20"
            >
              Done
            </button>
          ) : (
            <button
              onClick={next}
              disabled={!canProceed}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                canProceed
                  ? 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white shadow-sm shadow-violet-600/20'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
              }`}
            >
              {step === 'preview' ? 'Confirm Import' : 'Continue'} <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ImportPanel({ importJobs, onStartImport }: ImportPanelProps) {
  const [showWizard, setShowWizard] = useState(false)

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl space-y-6">

        {/* CTA banner */}
        <div className="bg-gradient-to-r from-violet-600 to-violet-700 dark:from-violet-700 dark:to-violet-800 rounded-xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Import data</h3>
              <p className="text-xs text-violet-200 mt-1">
                Bulk import items, customers, suppliers, and opening balances via CSV or Excel.
              </p>
            </div>
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-white text-violet-700 rounded-lg hover:bg-violet-50 transition-colors shrink-0 shadow-sm"
            >
              <Upload className="w-4 h-4" /> Start Import
            </button>
          </div>
        </div>

        {/* Import history */}
        <div>
          <h4 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Import History</h4>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1.5fr_100px_2fr_110px_1fr] gap-3 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              {['Entity', 'Status', 'File', 'Rows', 'Imported'].map((h, i) => (
                <span key={i} className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{h}</span>
              ))}
            </div>

            {importJobs.map((job, idx) => (
              <div
                key={job.id}
                className={`grid grid-cols-[1.5fr_100px_2fr_110px_1fr] gap-3 px-4 py-3 items-center ${
                  idx < importJobs.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{job.entity}</span>
                </div>
                <StatusBadge status={job.status} />
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate" title={job.fileName}>
                  {job.fileName}
                </p>
                <div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 tabular-nums">
                    {job.successRows.toLocaleString()} / {job.totalRows.toLocaleString()}
                  </p>
                  {job.errorRows > 0 && (
                    <p className="text-xs text-red-500 dark:text-red-400">{job.errorRows} errors</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {new Date(job.importedAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{job.importedBy.split(' ')[0]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showWizard && (
        <ImportWizard
          onClose={() => setShowWizard(false)}
          onStartImport={(entity, file) => {
            onStartImport?.(entity, file)
            setShowWizard(false)
          }}
        />
      )}
    </div>
  )
}
