import {
  Building2, Receipt, MapPin, Users, ShieldCheck, DollarSign,
  Tags, Bell, ClipboardList, Upload, Plug, Globe,
} from 'lucide-react'
import type { SettingsAdminProps } from '../types'
import { OrganisationPanel } from './panels/OrganisationPanel'
import { TaxationPanel } from './panels/TaxationPanel'
import { LocationsPanel } from './panels/LocationsPanel'
import { TeamPanel } from './panels/TeamPanel'
import { RolesPanel } from './panels/RolesPanel'
import { CurrenciesPanel } from './panels/CurrenciesPanel'
import { PriceListsPanel } from './panels/PriceListsPanel'
import { NotificationsPanel } from './panels/NotificationsPanel'
import { AuditPanel } from './panels/AuditPanel'
import { ImportPanel } from './panels/ImportPanel'
import { IntegrationsPanel } from './panels/IntegrationsPanel'
import { AppearancePanel } from './panels/AppearancePanel'

// ─── Category metadata ─────────────────────────────────────────────────────────

export type CategoryId =
  | 'organisation' | 'taxation' | 'locations' | 'team' | 'roles'
  | 'currencies' | 'pricelists' | 'notifications' | 'audit'
  | 'import' | 'integrations' | 'appearance'

const CATEGORY_META: Record<CategoryId, { label: string; description: string; icon: React.ElementType }> = {
  organisation: {
    label: 'Organisation',
    description: 'Company identity, registration, fiscal year, and document numbering.',
    icon: Building2,
  },
  taxation: {
    label: 'Taxation',
    description: 'Tax framework, components, rates, and groups for your country.',
    icon: Receipt,
  },
  locations: {
    label: 'Locations & Branches',
    description: 'Manage physical locations, operating hours, currencies, and staff access.',
    icon: MapPin,
  },
  team: {
    label: 'Team & Users',
    description: 'Invite team members, manage accounts, and control access.',
    icon: Users,
  },
  roles: {
    label: 'Roles & Permissions',
    description: 'Configure roles with module, action, and branch-level permissions.',
    icon: ShieldCheck,
  },
  currencies: {
    label: 'Currencies & Exchange Rates',
    description: 'Enable currencies and maintain exchange rate history.',
    icon: DollarSign,
  },
  pricelists: {
    label: 'Price Lists',
    description: 'Define retail, wholesale, and promotional pricing structures.',
    icon: Tags,
  },
  notifications: {
    label: 'Notifications',
    description: 'Configure alerts for system events across email and in-app channels.',
    icon: Bell,
  },
  audit: {
    label: 'Audit Trail',
    description: 'Immutable log of all system actions — who changed what and when.',
    icon: ClipboardList,
  },
  import: {
    label: 'Data Import',
    description: 'Bulk import items, customers, suppliers, and opening balances.',
    icon: Upload,
  },
  integrations: {
    label: 'Integrations & API',
    description: 'Manage API keys, webhooks, and third-party integrations.',
    icon: Plug,
  },
  appearance: {
    label: 'Appearance & Language',
    description: 'Language, date formats, number formats, and document branding.',
    icon: Globe,
  },
}

// ─── Placeholder panel ────────────────────────────────────────────────────────

function PlaceholderPanel({ categoryId }: { categoryId: CategoryId }) {
  const meta = CATEGORY_META[categoryId]
  const Icon = meta.icon
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 flex items-center justify-center mb-5">
        <Icon className="w-8 h-8 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-zinc-700 dark:text-zinc-300">{meta.label}</h3>
      <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-2 max-w-xs leading-relaxed">{meta.description}</p>
      <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-4">
        Run <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-violet-600 dark:text-violet-400">/design-screen</code> to build this panel.
      </p>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export interface SettingsAdminComponentProps extends SettingsAdminProps {
  /** Active settings category — driven by URL/nav, defaults to 'organisation' */
  activeCategory?: CategoryId
  /** Create or update a price list */
  onSavePriceList?: (priceList: any) => void
  /** Archive a price list */
  onArchivePriceList?: (id: string) => void
}

export function SettingsAdmin({
  activeCategory = 'organisation',
  organisation,
  taxFrameworks,
  activeTaxFramework,
  branches,
  users,
  roles,
  currencies,
  exchangeRateHistory,
  notificationEvents,
  auditLog,
  importJobs,
  apiKeys,
  webhooks,
  integrations,
  onSaveOrganisation,
  onSaveTaxFramework,
  onSaveBranch,
  onArchiveBranch,
  onInviteUser,
  onUpdateUser,
  onResendInvite,
  onRevokeInvite,
  onSaveRole,
  onDeleteRole,
  onToggleCurrency,
  onAddExchangeRate,
  onSaveNotificationEvent,
  onStartImport,
  onCreateApiKey,
  onRevokeApiKey,
  onSaveWebhook,
  onDeleteWebhook,
  onToggleIntegration,
  onSavePriceList,
  onArchivePriceList,
}: SettingsAdminComponentProps) {
  const meta = CATEGORY_META[activeCategory]
  const Icon = meta.icon

  function renderPanel() {
    switch (activeCategory) {
      case 'organisation':
        return <OrganisationPanel organisation={organisation} onSave={onSaveOrganisation} />
      case 'taxation':
        return (
          <TaxationPanel
            taxFrameworks={taxFrameworks}
            activeTaxFramework={activeTaxFramework}
            onSaveTaxFramework={onSaveTaxFramework}
          />
        )
      case 'locations':
        return (
          <LocationsPanel
            branches={branches}
            onSaveBranch={onSaveBranch}
            onArchiveBranch={onArchiveBranch}
          />
        )
      case 'team':
        return (
          <TeamPanel
            users={users}
            roles={roles}
            branches={branches}
            onInviteUser={onInviteUser}
            onUpdateUser={onUpdateUser}
            onResendInvite={onResendInvite}
            onRevokeInvite={onRevokeInvite}
          />
        )
      case 'roles':
        return (
          <RolesPanel
            roles={roles}
            onSaveRole={onSaveRole}
            onDeleteRole={onDeleteRole}
          />
        )
      case 'currencies':
        return (
          <CurrenciesPanel
            currencies={currencies}
            baseCurrency={organisation.baseCurrency}
            exchangeRateHistory={exchangeRateHistory}
            onToggleCurrency={onToggleCurrency}
            onAddExchangeRate={onAddExchangeRate}
          />
        )
      case 'pricelists':
        return (
          <PriceListsPanel
            onSavePriceList={onSavePriceList}
            onArchivePriceList={onArchivePriceList}
          />
        )
      case 'notifications':
        return (
          <NotificationsPanel
            notificationEvents={notificationEvents}
            onSaveNotificationEvent={onSaveNotificationEvent}
          />
        )
      case 'audit':
        return <AuditPanel auditLog={auditLog} />
      case 'import':
        return (
          <ImportPanel
            importJobs={importJobs}
            onStartImport={onStartImport}
          />
        )
      case 'integrations':
        return (
          <IntegrationsPanel
            apiKeys={apiKeys}
            webhooks={webhooks}
            integrations={integrations}
            onCreateApiKey={onCreateApiKey}
            onRevokeApiKey={onRevokeApiKey}
            onSaveWebhook={onSaveWebhook}
            onDeleteWebhook={onDeleteWebhook}
            onToggleIntegration={onToggleIntegration}
          />
        )
      case 'appearance':
        return (
          <AppearancePanel
            organisation={organisation}
            onSaveOrganisation={onSaveOrganisation}
          />
        )
      default:
        return <PlaceholderPanel categoryId={activeCategory} />
    }
  }

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">

      {/* ── Page header ── */}
      <div className="shrink-0 px-6 py-5 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3 max-w-3xl">
          <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">{meta.label}</h1>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{meta.description}</p>
          </div>
        </div>
      </div>

      {/* ── Panel content ── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {renderPanel()}
      </div>

    </div>
  )
}
