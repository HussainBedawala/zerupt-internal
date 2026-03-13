// ─── Organisation ─────────────────────────────────────────────────────────────

export interface Address {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface DocumentNumbering {
  type: string;
  prefix: string;
  suffix: string;
  padding: number;
  nextNumber: number;
}

export interface NumberFormat {
  decimalSeparator: string;
  thousandsSeparator: string;
}

export interface Organisation {
  id: string;
  companyName: string;
  legalName: string;
  tradingName: string;
  logo: string;
  country: string;
  countryName: string;
  address: Address;
  phone: string;
  email: string;
  website: string;
  registrationNumber: string;
  taxRegistrationNumber: string;
  industryType: 'retail' | 'wholesale' | 'manufacturing' | 'services' | 'other';
  businessType: 'retail' | 'wholesale' | 'both';
  fiscalYearStart: string;
  baseCurrency: string;
  timezone: string;
  dateFormat: string;
  numberFormat: NumberFormat;
  paperSize: 'A4' | 'Letter' | 'thermal_80mm';
  language: 'en' | 'ar';
  documentNumbering: DocumentNumbering[];
}

// ─── Taxation ─────────────────────────────────────────────────────────────────

export type TaxType = 'percentage' | 'fixed' | 'exempt';
export type TaxAppliesTo = 'sales' | 'purchases' | 'imports' | 'intrastate_sales' | 'intrastate_purchases' | 'interstate_sales' | 'interstate_purchases';

export interface TaxComponent {
  id: string;
  name: string;
  code: string;
  rate: number;
  type: TaxType;
  appliesTo: TaxAppliesTo[];
}

export interface TaxGroup {
  id: string;
  name: string;
  components: string[]; // TaxComponent ids
  isDefault: boolean;
}

export interface TaxFramework {
  id: string;
  country: string | null;
  name: string;
  description: string;
  registrationField: string;
  components: TaxComponent[];
  groups: TaxGroup[];
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export interface OperatingHours {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

export interface POSSettings {
  receiptHeader: string;
  receiptFooter: string;
  enabledPaymentMethods: string[];
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'inactive';
  address: Address;
  phone: string;
  email: string;
  timezone: string;
  currency: string;
  taxOverride: string | null; // TaxFramework id
  operatingHours: OperatingHours[];
  documentPrefixOverride: string | null;
  assignedUserIds: string[];
  warehouseIds: string[];
  posSettings: POSSettings | null;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export type UserStatus = 'active' | 'inactive' | 'invited';
export type InviteStatus = 'accepted' | 'pending' | 'expired';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  roleId: string;
  branchAccess: 'all' | string[]; // 'all' or array of Branch ids
  status: UserStatus;
  lastLogin: string | null;
  inviteStatus: InviteStatus;
  createdAt: string;
}

// ─── Roles & Permissions ──────────────────────────────────────────────────────

export type PermissionModule = 'POS' | 'Sales' | 'Purchasing' | 'Inventory' | 'Accounting' | 'Reports' | 'Settings';
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';
export type BranchScope = 'all' | 'assigned' | string[]; // string[] = specific branch ids

export interface Permission {
  module: PermissionModule;
  actions: PermissionAction[];
  branchScope: BranchScope;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  userCount: number;
  permissions: Permission[] | 'all' | 'all_except_admin' | 'read_only_all';
}

// ─── Currencies ───────────────────────────────────────────────────────────────

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  isBase: boolean;
  isEnabled: boolean;
  rate: number;
}

export interface ExchangeRate {
  id: string;
  currency: string;
  rate: number;
  effectiveDate: string;
  source: 'manual' | 'auto';
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationChannel = 'in_app' | 'email' | 'both';

export interface NotificationThreshold {
  unit: string;
  value: number;
}

export interface NotificationEvent {
  id: string;
  event: string;
  label: string;
  description: string;
  channel: NotificationChannel;
  enabled: boolean;
  threshold: NotificationThreshold | null;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  userId: string;
  module: string;
  action: 'create' | 'update' | 'delete' | 'login' | 'export';
  entity: string;
  entityId: string;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

// ─── Data Import ──────────────────────────────────────────────────────────────

export type ImportEntity = 'Item' | 'Customer' | 'Supplier' | 'OpeningStock' | 'ChartOfAccounts' | 'OpeningBalances';
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ImportJob {
  id: string;
  entity: ImportEntity;
  status: ImportStatus;
  fileName: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  importedAt: string;
  importedBy: string;
}

// ─── API & Webhooks ───────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: 'active' | 'revoked';
  lastUsed: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: 'active' | 'inactive';
  secretKey: string;
  lastTriggered: string | null;
  failureCount: number;
}

export interface Integration {
  id: string;
  name: string;
  category: string;
  logo: string;
  status: 'connected' | 'disconnected' | 'not_available';
  lastSync: string | null;
  description: string;
}

// ─── Section Props ────────────────────────────────────────────────────────────

export interface SettingsAdminProps {
  organisation: Organisation;
  taxFrameworks: TaxFramework[];
  activeTaxFramework: string;
  branches: Branch[];
  users: User[];
  roles: Role[];
  currencies: Currency[];
  exchangeRateHistory: ExchangeRate[];
  notificationEvents: NotificationEvent[];
  auditLog: AuditLogEntry[];
  importJobs: ImportJob[];
  apiKeys: ApiKey[];
  webhooks: Webhook[];
  integrations: Integration[];

  /** Save updated organisation details */
  onSaveOrganisation?: (data: Partial<Organisation>) => void;
  /** Switch or reconfigure the active tax framework */
  onSaveTaxFramework?: (frameworkId: string, components: TaxComponent[], groups: TaxGroup[]) => void;
  /** Create or update a branch */
  onSaveBranch?: (branch: Partial<Branch>) => void;
  /** Archive/deactivate a branch */
  onArchiveBranch?: (branchId: string) => void;
  /** Invite a new user by email */
  onInviteUser?: (email: string, roleId: string, branchAccess: 'all' | string[]) => void;
  /** Update an existing user's role, branch access, or status */
  onUpdateUser?: (userId: string, data: Partial<User>) => void;
  /** Resend invitation to a pending user */
  onResendInvite?: (userId: string) => void;
  /** Revoke a pending invitation */
  onRevokeInvite?: (userId: string) => void;
  /** Create or update a role with its permissions */
  onSaveRole?: (role: Partial<Role>) => void;
  /** Delete a custom role */
  onDeleteRole?: (roleId: string) => void;
  /** Enable or disable a currency */
  onToggleCurrency?: (currencyCode: string, enabled: boolean) => void;
  /** Add a manual exchange rate entry */
  onAddExchangeRate?: (currencyCode: string, rate: number, effectiveDate: string) => void;
  /** Update a notification event's settings */
  onSaveNotificationEvent?: (eventId: string, data: Partial<NotificationEvent>) => void;
  /** Trigger a data import job */
  onStartImport?: (entity: ImportEntity, file: File) => void;
  /** Generate a new API key */
  onCreateApiKey?: (name: string, scopes: string[]) => void;
  /** Revoke an API key */
  onRevokeApiKey?: (keyId: string) => void;
  /** Save or update a webhook */
  onSaveWebhook?: (webhook: Partial<Webhook>) => void;
  /** Delete a webhook */
  onDeleteWebhook?: (webhookId: string) => void;
  /** Connect or disconnect an integration */
  onToggleIntegration?: (integrationId: string, connect: boolean) => void;
}
