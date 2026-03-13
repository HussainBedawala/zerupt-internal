import { useState } from 'react'
import {
  Plus, Trash2, RotateCcw, CheckCircle2, XCircle,
  AlertCircle, Copy, Globe, Key,
} from 'lucide-react'
import type { ApiKey, Webhook, Integration } from '../../types'

interface IntegrationsPanelProps {
  apiKeys: ApiKey[]
  webhooks: Webhook[]
  integrations: Integration[]
  onCreateApiKey?: (name: string, scopes: string[]) => void
  onRevokeApiKey?: (keyId: string) => void
  onSaveWebhook?: (webhook: Partial<Webhook>) => void
  onDeleteWebhook?: (webhookId: string) => void
  onToggleIntegration?: (integrationId: string, connect: boolean) => void
}

type Tab = 'integrations' | 'api-keys' | 'webhooks'

// ─── Integration status badge ──────────────────────────────────────────────────

function IntegrationStatus({ status }: { status: Integration['status'] }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
        <CheckCircle2 className="w-3 h-3" /> Connected
      </span>
    )
  }
  if (status === 'disconnected') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
        <XCircle className="w-3 h-3" /> Not connected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500">
      <AlertCircle className="w-3 h-3" /> Not available
    </span>
  )
}

// ─── API key row ───────────────────────────────────────────────────────────────

function ApiKeyRow({ apiKey, onRevoke }: { apiKey: ApiKey; onRevoke?: () => void }) {
  const [copied, setCopied] = useState(false)
  const isActive = apiKey.status === 'active'

  function copy() {
    navigator.clipboard.writeText(apiKey.prefix)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`px-4 py-4 border-b border-zinc-100 dark:border-zinc-800 last:border-0 transition-opacity ${!isActive ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Name & status */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950 flex items-center justify-center shrink-0">
              <Key className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{apiKey.name}</p>
            {isActive ? (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-medium">Active</span>
            ) : (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 font-medium">Revoked</span>
            )}
          </div>

          {/* Key prefix */}
          <div className="flex items-center gap-2 mt-2 ml-9">
            <code className="text-xs font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
              {apiKey.prefix}_•••••••••••••
            </code>
            {isActive && (
              <button
                onClick={copy}
                className="text-xs text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
              >
                {copied ? (
                  <span className="text-teal-600 dark:text-teal-400">✓ Copied</span>
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            )}
          </div>

          {/* Scopes */}
          <div className="flex items-center gap-1.5 mt-2 ml-9 flex-wrap">
            {apiKey.scopes.map(scope => (
              <span key={scope} className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                {scope}
              </span>
            ))}
          </div>

          {/* Meta */}
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5 ml-9">
            {apiKey.lastUsed ? `Last used ${new Date(apiKey.lastUsed).toLocaleDateString()}` : 'Never used'}
            {apiKey.expiresAt && ` · Expires ${new Date(apiKey.expiresAt).toLocaleDateString()}`}
          </p>
        </div>

        {isActive && (
          <button
            onClick={onRevoke}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/70 rounded-lg transition-colors border border-red-200 dark:border-red-800"
          >
            <Trash2 className="w-3 h-3" /> Revoke
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Webhook row ───────────────────────────────────────────────────────────────

function WebhookRow({ webhook, onEdit, onDelete }: {
  webhook: Webhook
  onEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Name + status */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{webhook.name}</p>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${
              webhook.status === 'active'
                ? 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
            }`}>
              {webhook.status === 'active' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {webhook.status}
            </span>
            {webhook.failureCount > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                <AlertCircle className="w-3 h-3" /> {webhook.failureCount} failures
              </span>
            )}
          </div>

          {/* URL */}
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 font-mono truncate" title={webhook.url}>
            {webhook.url}
          </p>

          {/* Events */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {webhook.events.map(event => (
              <span key={event} className="text-[11px] font-mono text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 px-1.5 py-0.5 rounded">
                {event}
              </span>
            ))}
          </div>

          {webhook.lastTriggered && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">
              Last triggered: {new Date(webhook.lastTriggered).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
            title="Test webhook"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title="Delete webhook"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

const INTEGRATION_CATEGORIES = ['Payment Gateway', 'E-commerce', 'Shipping', 'Accounting Sync'] as const

export function IntegrationsPanel({
  apiKeys, webhooks, integrations,
  onCreateApiKey, onRevokeApiKey, onSaveWebhook, onDeleteWebhook, onToggleIntegration,
}: IntegrationsPanelProps) {
  const [tab, setTab] = useState<Tab>('integrations')

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'integrations', label: 'Integrations', count: integrations.filter(i => i.status === 'connected').length },
    { id: 'api-keys', label: 'API Keys', count: apiKeys.filter(k => k.status === 'active').length },
    { id: 'webhooks', label: 'Webhooks', count: webhooks.length },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="shrink-0 px-6 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-violet-600 dark:border-violet-400 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  tab === t.id
                    ? 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl">

          {/* ── Integrations tab ── */}
          {tab === 'integrations' && (
            <div className="space-y-6">
              {INTEGRATION_CATEGORIES.map(cat => {
                const items = integrations.filter(i => i.category === cat)
                if (!items.length) return null
                return (
                  <div key={cat}>
                    <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">{cat}</p>
                    <div className="space-y-2">
                      {items.map(integration => (
                        <div
                          key={integration.id}
                          className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-4"
                        >
                          <div className="flex items-start gap-4">
                            {/* Logo placeholder */}
                            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-700">
                              <Globe className="w-5 h-5 text-zinc-400" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{integration.name}</p>
                                <IntegrationStatus status={integration.status} />
                              </div>
                              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 leading-relaxed">{integration.description}</p>
                              {integration.lastSync && (
                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                                  Last sync: {new Date(integration.lastSync).toLocaleString()}
                                </p>
                              )}
                            </div>

                            {integration.status !== 'not_available' && (
                              <button
                                onClick={() => onToggleIntegration?.(integration.id, integration.status !== 'connected')}
                                className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                  integration.status === 'connected'
                                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 border border-zinc-200 dark:border-zinc-700'
                                    : 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white shadow-sm shadow-violet-600/20'
                                }`}
                              >
                                {integration.status === 'connected' ? 'Disconnect' : 'Connect'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── API Keys tab ── */}
          {tab === 'api-keys' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-md leading-relaxed">
                  API keys grant programmatic access to your data. Keep them secret — never share them in public repositories or client-side code.
                </p>
                <button
                  onClick={() => onCreateApiKey?.('New API Key', ['all:read'])}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white rounded-lg transition-colors shadow-sm shadow-violet-600/20 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Generate Key
                </button>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                {apiKeys.map(key => (
                  <ApiKeyRow key={key.id} apiKey={key} onRevoke={() => onRevokeApiKey?.(key.id)} />
                ))}
              </div>
            </div>
          )}

          {/* ── Webhooks tab ── */}
          {tab === 'webhooks' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-md leading-relaxed">
                  Webhooks send real-time HTTP POST notifications to your endpoints when system events occur.
                </p>
                <button
                  onClick={() => onSaveWebhook?.({})}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white rounded-lg transition-colors shadow-sm shadow-violet-600/20 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Webhook
                </button>
              </div>

              <div className="space-y-3">
                {webhooks.map(webhook => (
                  <WebhookRow
                    key={webhook.id}
                    webhook={webhook}
                    onEdit={() => onSaveWebhook?.(webhook)}
                    onDelete={() => onDeleteWebhook?.(webhook.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
