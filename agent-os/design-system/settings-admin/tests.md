# Test Specs: Settings & Admin

These test specs are **framework-agnostic**. Adapt them to your testing setup.

## Overview
Tests cover the full settings control center: organisation profile, taxation framework configuration with country presets, branch management, team member invitation, roles and permissions matrix, currency/exchange rate management, and the data import wizard. Also covers audit trail browsing and unsaved changes warnings.

---

## User Flow Tests

### Flow 1: Configure a Tax Framework Using a Country Preset

**Scenario:** Admin sets up the taxation framework for a Kuwait-based business (UAE VAT equivalent — 5%).

#### Success Path
**Setup:** The organisation country is not yet configured. No transactions exist.

**Steps:**
1. Navigate to Settings > Taxation.
2. In the country selector dropdown, search for and select "Kuwait" — the system loads the standard Gulf VAT framework preset.
3. The framework fields auto-populate: "VAT Rate: 5%", "VAT Registration Number" field appears.
4. Review the auto-populated components and rates.
5. Add a custom tax component: name "Import Duty", rate `3%`, applicability "Purchase / Import only".
6. Create a tax group: name "Standard Import", components "VAT 5% + Import Duty 3%".
7. Enter the company's VAT registration number in the designated field.
8. Tap "Save Changes" — the framework is saved.
9. Verify that the "Save Changes" button is disabled again after saving.
10. Navigate away to another settings category (Organisation) and return to Taxation — saved values persist.

**Expected Results:**
- [ ] Country selection triggers an animated transition to the framework-specific fields.
- [ ] Pre-populated rates match the Kuwait/Gulf VAT framework (5%).
- [ ] Custom tax components can be added on top of the preset.
- [ ] Tax groups bundle multiple components into a single selectable code.
- [ ] "Save Changes" button is disabled when no changes are pending.
- [ ] "Save Changes" button becomes enabled as soon as any field is changed.
- [ ] Saved configuration persists after navigating away and returning.

#### Failure Path: Save with Missing VAT Registration Number
**Steps:**
1. Select the UAE VAT framework.
2. Leave the VAT registration number field empty.
3. Tap "Save Changes".

**Expected Results:**
- [ ] Validation error: "VAT registration number is required for this tax framework."
- [ ] Settings do not save.

---

### Flow 2: Invite a Team Member and Assign a Role

**Scenario:** Admin invites a new sales representative and assigns them limited branch access.

#### Success Path
**Setup:** At least two branches exist. "Sales Rep" system role exists.

**Steps:**
1. Navigate to Settings > Team & Users.
2. Tap "Invite User" — an invitation form opens.
3. Enter email: "newrep@company.kw".
4. Select role: "Sales Rep".
5. Set branch access: select "Branch A" only (not all branches).
6. Tap "Send Invite" — the invitation is sent and the user appears in the list with status "Pending".
7. Verify the invite row shows: email, role, branch access, status "Pending", and "Resend" / "Revoke" action buttons.
8. Tap "Resend" — a confirmation toast appears: "Invitation resent to newrep@company.kw."
9. Simulate the user accepting the invite — their status changes from "Pending" to "Active".

**Expected Results:**
- [ ] Invitation form requires email, role, and branch access.
- [ ] Sent invitation appears in the user list with "Pending" status badge.
- [ ] "Resend" and "Revoke" actions are available on pending invitations.
- [ ] After acceptance, status changes to "Active" and the user gains the assigned role and branch access.
- [ ] The invited user only sees Branch A data when logged in.

#### Failure Path: Invite with Invalid Email
**Steps:**
1. Enter "not-an-email" in the email field.
2. Tap "Send Invite".

**Expected Results:**
- [ ] Validation error: "Please enter a valid email address."
- [ ] Invitation is not sent.

#### Failure Path: Duplicate Email Invitation
**Steps:**
1. Attempt to invite an email address that already exists as an active user.

**Expected Results:**
- [ ] Error: "A user with this email already exists."
- [ ] Invitation is not sent.

---

### Flow 3: Create a Custom Role with a Permission Matrix

**Scenario:** Admin creates a "Senior Cashier" custom role with specific permissions.

#### Success Path
**Setup:** Default system roles exist.

**Steps:**
1. Navigate to Settings > Roles & Permissions.
2. Tap "Create Role" — a role creation form opens.
3. Enter role name: "Senior Cashier", enter description: "Full POS access plus void permissions."
4. Select "Copy Permissions From": "Cashier" — the permission matrix is pre-filled with Cashier's current permissions.
5. In the permission matrix, locate the POS module row.
6. Enable the "Approve" permission for POS (to allow voiding transactions).
7. Verify the Accounting module remains fully restricted (no permissions checked).
8. Tap "Save Role" — the "Senior Cashier" role is created and appears in the roles list.
9. Verify the role shows "0 users" in the user count column.
10. Navigate to Team & Users and edit an existing cashier's role — the "Senior Cashier" option is available in the role dropdown.

**Expected Results:**
- [ ] "Copy Permissions From" pre-fills the matrix with the selected role's permissions.
- [ ] The permission matrix is a scrollable grid: modules on rows, actions (View, Create, Edit, Delete, Approve, Export) on columns.
- [ ] Enabling a permission updates the matrix immediately.
- [ ] Saved custom role appears in the roles list.
- [ ] Custom role is available as an option when editing user roles.

---

### Flow 4: Data Import — Items via CSV

**Scenario:** Admin imports a batch of new inventory items using the CSV import wizard.

#### Success Path
**Setup:** A valid CSV file with item data is prepared according to the template format.

**Steps:**
1. Navigate to Settings > Data Import / Migration.
2. Select entity type: "Items".
3. Tap "Download Template" — a CSV template file is downloaded with the correct column headers.
4. Tap "Upload File" and select the prepared CSV file (100 rows, 95 valid, 5 with errors).
5. The wizard moves to the preview step — a table shows the mapped data with the first 10 rows.
6. Error rows (5 of them) are highlighted in red with row-level error messages (e.g., "Row 12: Missing required field 'SKU'").
7. Valid rows (95) are shown with a green checkmark.
8. Tap "Import Valid Rows (95)" — a progress indicator shows import progress.
9. After completion, a results summary: "95 items imported. 5 rows skipped."
10. Navigate to Inventory > Items — all 95 newly imported items appear.
11. Return to Settings > Data Import and verify the import history log shows this import event with timestamp and result.

**Expected Results:**
- [ ] Template download provides a correctly structured file for the selected entity.
- [ ] Preview step shows mapped columns and all row data before committing.
- [ ] Error rows are visually differentiated with row-level error messages.
- [ ] User can import valid rows without fixing error rows first.
- [ ] Progress indicator is shown during import.
- [ ] Results summary shows imported count and skipped count.
- [ ] Import history log is updated with the event.

#### Failure Path: Upload Wrong File Format
**Steps:**
1. Select entity "Items".
2. Upload a PDF file.

**Expected Results:**
- [ ] Error: "Invalid file format. Please upload a CSV or Excel (.xlsx) file."
- [ ] No data is processed.

---

### Flow 5: Unsaved Changes Warning

**Scenario:** Admin makes changes to the Organisation settings but tries to navigate away without saving.

#### Success Path
**Setup:** The Organisation settings panel is open.

**Steps:**
1. Navigate to Settings > Organisation.
2. Change the company name to a new value.
3. The "Save Changes" button becomes enabled.
4. Click "Taxation" in the settings sidebar without saving.
5. An unsaved changes warning dialog appears: "You have unsaved changes. If you leave, your changes will be lost."
6. Two options are shown: "Leave Without Saving" and "Stay and Save".
7. Tap "Stay and Save" — the dialog closes and the user remains on Organisation settings.
8. Tap "Save Changes" — settings are saved.
9. The "Save Changes" button is disabled.
10. Click "Taxation" again — navigation proceeds without a warning.

**Expected Results:**
- [ ] Unsaved changes warning appears when navigating away with pending changes.
- [ ] "Stay and Save" keeps the user on the current page.
- [ ] "Leave Without Saving" navigates away and discards the changes.
- [ ] After saving, navigation proceeds without warning.

---

## Empty State Tests

### No Team Members
- Navigate to Settings > Team & Users on a fresh installation — only the current admin account is listed with status "Active". An "Invite Users" call-to-action is shown.

### No Custom Roles
- Navigate to Settings > Roles & Permissions — only system default roles are listed. A "Create Custom Role" button is shown.

### No Audit Trail Entries
- Navigate to Settings > Audit Trail with no log entries — "No activity logged yet."

### No Integrations Connected
- Navigate to Settings > Integrations & API — integration cards show "Not Connected" status for all available integrations.

---

## Component Interaction Tests

### Settings Sidebar
- The active settings category is highlighted in the left sidebar.
- The sidebar is collapsible to icons on smaller screens.
- Clicking a sidebar item triggers the unsaved changes check if changes are pending on the current panel.

### Permission Matrix
- The matrix supports sticky column headers so module names remain visible when scrolling horizontally.
- Sticky row headers keep action names (View, Create, Edit, etc.) visible when scrolling vertically through many modules.
- A "Select All" checkbox on a row grants all permissions for that module at once.
- A "Select All" checkbox on a column grants all modules' permission for that action.

### Branch Cards
- Branches are displayed as cards with status badge (Active / Inactive).
- Clicking a branch card opens a multi-tab detail panel: Details, Hours, Warehouses, Team, POS Settings.
- The archive action on a branch prompts: "Archiving a branch will remove it from active selection. Existing data is preserved."

### Exchange Rate History
- Navigating to Settings > Currencies shows a list of enabled currencies.
- Clicking a currency opens its exchange rate history as a timeline.
- Editing a past rate row shows a warning: "Changing historical rates may affect past financial statements."

---

## Edge Cases

### Base Currency Lock After First Transaction
- Once a transaction is recorded, the "Base Currency" field in Settings > Currencies is read-only.
- A tooltip explains: "Base currency cannot be changed after the first transaction is recorded."

### Deactivate User — Audit History Preserved
- Deactivate a user who has created transactions.
- Verify that all their historical transactions, journal entries, and audit log entries still reference their name.
- The deactivated user no longer appears in active user dropdowns but is still searchable in audit trail filters.

### Tax Rate Change with Existing Transactions
- Change the VAT rate from 5% to 0% in Taxation settings.
- A warning: "Changing this rate will affect all future transactions. Existing transactions are not affected."
- Confirm — future invoices use the new rate; past invoices retain the original rate.

### Document Numbering Sequence Conflict
- Set two document types to start from the same sequence number.
- The system should either auto-prevent this or warn: "Duplicate starting numbers may cause conflicts in document numbering."

### API Key Scope Restriction
- Generate an API key with only "Sales: Read" scope.
- Attempting to use the key to create an invoice returns an authorization error.

---

## Accessibility Checks

- [ ] The settings sidebar uses `role="navigation"` with `aria-label="Settings navigation"`.
- [ ] The active sidebar item is indicated with `aria-current="page"`.
- [ ] The permission matrix table uses proper `<th scope="col">` and `<th scope="row">` for screen reader navigation.
- [ ] The unsaved changes warning dialog traps focus and uses `role="alertdialog"`.
- [ ] The import wizard stepper communicates current step via `aria-current="step"` and step labels.
- [ ] The country selector for tax framework announces the framework change: "UAE VAT framework loaded."
- [ ] All toggle switches (enable/disable notification types, currency enable/disable) have descriptive labels beyond "On/Off".
- [ ] Error messages in forms are associated with their input fields via `aria-describedby`.
- [ ] The audit trail table supports keyboard navigation and is announced as a table with row count to screen readers.

---

## Sample Test Data

```typescript
// Organisation Settings
const mockOrganisation = {
  companyName: "Malakstar Retail Group",
  legalName: "Malakstar Trading W.L.L.",
  tradingName: "Malakstar",
  logoUrl: "https://placehold.co/200x80",
  country: "KW",
  phone: "+965-2222-0000",
  email: "info@malakstar.kw",
  website: "https://malakstar.kw",
  businessRegistrationNumber: "123456",
  taxRegistrationNumber: "300123456789003",
  industryType: "retail",
  businessType: "both" as const,
  fiscalYearStartMonth: 1,
  baseCurrency: "KWD",
  timezone: "Asia/Kuwait",
  dateFormat: "DD/MM/YYYY",
  documentSequences: [
    { type: "invoice", prefix: "INV", padding: 4, nextNumber: 111 },
    { type: "purchase_order", prefix: "PO", padding: 4, nextNumber: 56 },
    { type: "quotation", prefix: "QT", padding: 4, nextNumber: 43 },
  ],
};

// Branch
const mockBranch = {
  id: "branch-001",
  name: "Kuwait City Branch",
  address: "Block 5, Al-Hamra Tower, Kuwait City",
  phone: "+965-2222-0001",
  email: "kc@malakstar.kw",
  timezone: "Asia/Kuwait",
  currency: "KWD",
  status: "active" as const,
  operatingHours: [
    { day: "sunday", open: "09:00", close: "22:00", isClosed: false },
    { day: "monday", open: "09:00", close: "22:00", isClosed: false },
    { day: "friday", open: "14:00", close: "22:00", isClosed: false },
    { day: "saturday", open: "09:00", close: "22:00", isClosed: false },
  ],
  assignedWarehouseIds: ["wh-001"],
};

// User
const mockUser = {
  id: "user-001",
  name: "Sara Al-Mutairi",
  email: "sara@malakstar.kw",
  roleId: "role-cashier",
  roleName: "Cashier",
  branchAccess: ["branch-001"],
  status: "active" as const,
  lastLogin: "2024-03-10T08:45:00Z",
};

// Pending Invitation
const mockInvitation = {
  id: "inv-001",
  email: "newrep@malakstar.kw",
  roleId: "role-sales-rep",
  roleName: "Sales Rep",
  branchAccess: ["branch-001"],
  status: "pending" as const,
  sentAt: "2024-03-10T09:00:00Z",
  expiresAt: "2024-03-17T09:00:00Z",
};

// Role
const mockRole = {
  id: "role-senior-cashier",
  name: "Senior Cashier",
  description: "Full POS access plus void/approve permissions.",
  isSystem: false,
  userCount: 0,
  permissions: [
    { module: "pos", action: "view", branchScope: "assigned" },
    { module: "pos", action: "create", branchScope: "assigned" },
    { module: "pos", action: "edit", branchScope: "assigned" },
    { module: "pos", action: "approve", branchScope: "assigned" },
  ],
};

// Tax Component
const mockTaxComponent = {
  id: "tax-vat5",
  name: "VAT",
  rate: 0.05,
  framework: "gulf_vat",
  applicability: ["sale", "purchase"],
  registrationNumber: "300123456789003",
  isCustom: false,
};

// Audit Trail Entry
const mockAuditEntry = {
  id: "audit-001",
  userId: "user-001",
  userName: "Sara Al-Mutairi",
  module: "sales",
  action: "create",
  entityType: "invoice",
  entityId: "inv-001",
  entityLabel: "INV-2024-0110",
  timestamp: "2024-03-10T11:00:00Z",
  ipAddress: "192.168.1.45",
  beforeValues: null,
  afterValues: { status: "draft", grandTotal: 500.0 },
};

// Import Result
const mockImportResult = {
  id: "import-001",
  entity: "items",
  fileName: "items_march_2024.csv",
  importedAt: "2024-03-10T10:30:00Z",
  importedBy: "user-admin-01",
  totalRows: 100,
  successCount: 95,
  errorCount: 5,
  errors: [
    { row: 12, field: "sku", message: "Missing required field 'SKU'." },
    { row: 23, field: "price", message: "Invalid value: 'ABC' is not a valid number." },
    { row: 47, field: "sku", message: "Duplicate SKU 'ITEM-042' already exists." },
    { row: 65, field: "category", message: "Category 'Electronics-New' not found." },
    { row: 89, field: "cost", message: "Cost cannot be negative." },
  ],
};
```
