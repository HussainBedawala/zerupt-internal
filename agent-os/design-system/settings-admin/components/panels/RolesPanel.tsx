import { useState, useCallback } from 'react'
import {
  Plus, Lock, Trash2, ChevronDown, X, Shield, AlertTriangle,
} from 'lucide-react'
import type {
  Role, Permission, PermissionModule, PermissionAction, BranchScope,
} from '../../types'

interface RolesPanelProps {
  roles: Role[]
  onSaveRole?: (role: Partial<Role>) => void
  onDeleteRole?: (roleId: string) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULES: PermissionModule[] = ['POS', 'Sales', 'Purchasing', 'Inventory', 'Accounting', 'Reports', 'Settings']
const ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'approve', 'export']

type PermMatrix = Record<PermissionModule, Record<PermissionAction, boolean>>
type BranchScopes = Record<PermissionModule, BranchScope>

function emptyMatrix(): PermMatrix {
  const m = {} as PermMatrix
  for (const mod of MODULES) {
    m[mod] = {} as Record<PermissionAction, boolean>
    for (const act of ACTIONS) {
      m[mod][act] = false
    }
  }
  return m
}

function emptyScopes(): BranchScopes {
  const s = {} as BranchScopes
  for (const mod of MODULES) {
    s[mod] = 'all'
  }
  return s
}

function buildMatrix(permissions: Role['permissions']): PermMatrix {
  const m = emptyMatrix()
  if (permissions === 'all') {
    for (const mod of MODULES) for (const act of ACTIONS) m[mod][act] = true
  } else if (permissions === 'all_except_admin') {
    for (const mod of MODULES) {
      for (const act of ACTIONS) {
        m[mod][act] = mod !== 'Settings'
      }
    }
  } else if (permissions === 'read_only_all') {
    for (const mod of MODULES) m[mod]['view'] = true
  } else if (Array.isArray(permissions)) {
    for (const p of permissions) {
      if (m[p.module]) {
        for (const act of p.actions) m[p.module][act] = true
      }
    }
  }
  return m
}

function buildScopes(permissions: Role['permissions']): BranchScopes {
  const s = emptyScopes()
  if (Array.isArray(permissions)) {
    for (const p of permissions) {
      if (s[p.module] !== undefined) s[p.module] = p.branchScope
    }
  }
  return s
}

function matrixToPermissions(matrix: PermMatrix, scopes: BranchScopes): Permission[] {
  return MODULES.map(mod => ({
    module: mod,
    actions: ACTIONS.filter(act => matrix[mod][act]),
    branchScope: scopes[mod],
  })).filter(p => p.actions.length > 0)
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function inputCls() {
  return 'w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors'
}

// ─── Permission matrix component ─────────────────────────────────────────────

interface PermMatrixEditorProps {
  matrix: PermMatrix
  scopes: BranchScopes
  onChange: (mod: PermissionModule, act: PermissionAction, val: boolean) => void
  onScopeChange: (mod: PermissionModule, scope: BranchScope) => void
  readOnly?: boolean
}

function PermMatrixEditor({ matrix, scopes, onChange, onScopeChange, readOnly }: PermMatrixEditorProps) {
  const [specificBranchInput, setSpecificBranchInput] = useState<Record<string, string>>({})

  function toggleRow(mod: PermissionModule) {
    if (readOnly) return
    const allChecked = ACTIONS.every(a => matrix[mod][a])
    for (const act of ACTIONS) onChange(mod, act, !allChecked)
  }

  function handleScopeChange(mod: PermissionModule, val: string) {
    if (val === 'specific') {
      onScopeChange(mod, [])
    } else {
      onScopeChange(mod, val as 'all' | 'assigned')
    }
  }

  function getScopeValue(scope: BranchScope): string {
    if (scope === 'all') return 'all'
    if (scope === 'assigned') return 'assigned'
    return 'specific'
  }

  function addSpecificBranch(mod: PermissionModule) {
    const val = (specificBranchInput[mod] ?? '').trim()
    if (!val) return
    const current = Array.isArray(scopes[mod]) ? (scopes[mod] as string[]) : []
    if (!current.includes(val)) {
      onScopeChange(mod, [...current, val])
    }
    setSpecificBranchInput(prev => ({ ...prev, [mod]: '' }))
  }

  function removeSpecificBranch(mod: PermissionModule, branch: string) {
    const current = Array.isArray(scopes[mod]) ? (scopes[mod] as string[]) : []
    onScopeChange(mod, current.filter(b => b !== branch))
  }

  return (
    <div className="overflow-x-auto">
      {/* Desktop table */}
      <table className="w-full text-sm hidden md:table">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-700">
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide w-36">Module</th>
            {ACTIONS.map(act => (
              <th key={act} className="text-center py-2.5 px-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide capitalize">{act}</th>
            ))}
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Branch Scope</th>
          </tr>
        </thead>
        <tbody>
          {MODULES.map(mod => {
            const allChecked = ACTIONS.every(a => matrix[mod][a])
            const anyChecked = ACTIONS.some(a => matrix[mod][a])
            const rowTint = allChecked && !readOnly
              ? 'bg-teal-50 dark:bg-teal-950/20'
              : anyChecked && !readOnly
              ? 'bg-violet-50/30 dark:bg-violet-950/10'
              : ''

            return (
              <tr key={mod} className={`border-b border-zinc-100 dark:border-zinc-800 last:border-0 ${rowTint}`}>
                <td className="py-2.5 px-3">
                  <button
                    onClick={() => toggleRow(mod)}
                    disabled={readOnly}
                    className={`text-sm font-semibold text-zinc-800 dark:text-zinc-200 ${!readOnly ? 'hover:text-violet-600 dark:hover:text-violet-400 cursor-pointer' : 'cursor-default'} transition-colors`}
                    title={!readOnly ? 'Click to toggle all' : undefined}
                  >
                    {mod}
                  </button>
                </td>
                {ACTIONS.map(act => (
                  <td key={act} className="py-2.5 px-2 text-center">
                    <input
                      type="checkbox"
                      checked={matrix[mod][act]}
                      onChange={e => onChange(mod, act, e.target.checked)}
                      disabled={readOnly}
                      className="accent-violet-600 w-4 h-4 cursor-pointer disabled:cursor-default"
                    />
                  </td>
                ))}
                <td className="py-2.5 px-3">
                  <div className="space-y-1.5">
                    <div className="relative">
                      <select
                        value={getScopeValue(scopes[mod])}
                        onChange={e => handleScopeChange(mod, e.target.value)}
                        disabled={readOnly}
                        className="appearance-none text-xs px-2 py-1.5 pr-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500/40 focus:border-violet-500 disabled:opacity-60 w-full"
                      >
                        <option value="all">All Branches</option>
                        <option value="assigned">Assigned Branches Only</option>
                        <option value="specific">Specific Branches...</option>
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400 pointer-events-none" />
                    </div>
                    {getScopeValue(scopes[mod]) === 'specific' && (
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {(scopes[mod] as string[]).map(b => (
                            <span key={b} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300">
                              {b}
                              {!readOnly && (
                                <button onClick={() => removeSpecificBranch(mod, b)} className="hover:text-violet-900 dark:hover:text-violet-100">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                        {!readOnly && (
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={specificBranchInput[mod] ?? ''}
                              onChange={e => setSpecificBranchInput(prev => ({ ...prev, [mod]: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && addSpecificBranch(mod)}
                              placeholder="Branch ID..."
                              className="flex-1 text-xs px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-violet-400"
                            />
                            <button
                              onClick={() => addSpecificBranch(mod)}
                              className="px-2 py-1 text-xs bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 rounded-md hover:bg-violet-200 dark:hover:bg-violet-900"
                            >
                              Add
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {MODULES.map(mod => {
          const allChecked = ACTIONS.every(a => matrix[mod][a])
          return (
            <div key={mod} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 border border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{mod}</span>
                {!readOnly && (
                  <button
                    onClick={() => toggleRow(mod)}
                    className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    {allChecked ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {ACTIONS.map(act => (
                  <label key={act} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matrix[mod][act]}
                      onChange={e => onChange(mod, act, e.target.checked)}
                      disabled={readOnly}
                      className="accent-violet-600 w-3.5 h-3.5"
                    />
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 capitalize">{act}</span>
                  </label>
                ))}
              </div>
              <div className="relative">
                <select
                  value={getScopeValue(scopes[mod])}
                  onChange={e => handleScopeChange(mod, e.target.value)}
                  disabled={readOnly}
                  className="appearance-none w-full text-xs px-2 py-1.5 pr-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-700 dark:text-zinc-300 focus:outline-none"
                >
                  <option value="all">All Branches</option>
                  <option value="assigned">Assigned Branches Only</option>
                  <option value="specific">Specific Branches...</option>
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400 pointer-events-none" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function RolesPanel({ roles, onSaveRole, onDeleteRole }: RolesPanelProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string | 'new' | null>(
    roles[0]?.id ?? null
  )
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [permMatrix, setPermMatrix] = useState<PermMatrix>(emptyMatrix())
  const [branchScopes, setBranchScopes] = useState<BranchScopes>(emptyScopes())
  const [isDirty, setIsDirty] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const selectedRole = selectedRoleId === 'new' ? null : roles.find(r => r.id === selectedRoleId) ?? null

  const loadRole = useCallback((role: Role | null) => {
    if (!role) {
      setEditName('')
      setEditDesc('')
      setPermMatrix(emptyMatrix())
      setBranchScopes(emptyScopes())
    } else {
      setEditName(role.name)
      setEditDesc(role.description)
      setPermMatrix(buildMatrix(role.permissions))
      setBranchScopes(buildScopes(role.permissions))
    }
    setIsDirty(false)
    setShowDeleteConfirm(false)
  }, [])

  function selectRole(idOrNew: string | 'new') {
    setSelectedRoleId(idOrNew)
    const role = idOrNew === 'new' ? null : roles.find(r => r.id === idOrNew) ?? null
    loadRole(role)
  }

  function handleMatrixChange(mod: PermissionModule, act: PermissionAction, val: boolean) {
    setPermMatrix(prev => ({ ...prev, [mod]: { ...prev[mod], [act]: val } }))
    setIsDirty(true)
  }

  function handleScopeChange(mod: PermissionModule, scope: BranchScope) {
    setBranchScopes(prev => ({ ...prev, [mod]: scope }))
    setIsDirty(true)
  }

  function handleSave() {
    const permissions = matrixToPermissions(permMatrix, branchScopes)
    const data: Partial<Role> = {
      name: editName,
      description: editDesc,
      permissions,
      isSystem: false,
    }
    if (selectedRoleId !== 'new' && selectedRoleId) data.id = selectedRoleId
    onSaveRole?.(data)
    setIsDirty(false)
  }

  function handleDiscard() {
    loadRole(selectedRole)
  }

  function handleDelete() {
    if (selectedRoleId && selectedRoleId !== 'new') {
      onDeleteRole?.(selectedRoleId)
      setSelectedRoleId(roles.find(r => r.id !== selectedRoleId)?.id ?? null)
      setShowDeleteConfirm(false)
    }
  }

  const isReadOnly = selectedRole?.isSystem ?? false
  const isNew = selectedRoleId === 'new'

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">

      {/* ── Left: Role list ── */}
      <div className="w-70 shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden bg-white dark:bg-zinc-900">
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Roles</span>
          <button
            onClick={() => selectRole('new')}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Role
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {roles.map(role => {
            const isSelected = selectedRoleId === role.id
            return (
              <button
                key={role.id}
                onClick={() => selectRole(role.id)}
                className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${
                  isSelected
                    ? 'border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 border-l-4 border-l-violet-500'
                    : 'border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/60 hover:border-zinc-200 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{role.name}</span>
                      {role.isSystem && (
                        <Lock className="w-3 h-3 text-zinc-400 dark:text-zinc-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate leading-relaxed">{role.description}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">{role.userCount} user{role.userCount !== 1 ? 's' : ''}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        role.isSystem
                          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                          : 'bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400'
                      }`}>
                        {role.isSystem ? 'System' : 'Custom'}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}

          {/* New Role dashed card */}
          <button
            onClick={() => selectRole('new')}
            className={`w-full text-left px-3 py-3 rounded-xl border-2 border-dashed transition-all ${
              selectedRoleId === 'new'
                ? 'border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-950/30'
                : 'border-zinc-200 dark:border-zinc-700 hover:border-violet-300 dark:hover:border-violet-700 text-zinc-400 dark:text-zinc-500 hover:text-violet-500 dark:hover:text-violet-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">Create custom role</span>
            </div>
          </button>
        </div>
      </div>

      {/* ── Right: Permission editor ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
        {selectedRoleId === null ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Shield className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Select a role to view or edit permissions.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

              {/* Lock notice for system roles */}
              {isReadOnly && (
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    This is a system role and cannot be modified. Duplicate it to create a custom version.
                  </p>
                </div>
              )}

              {/* Role name & description */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Role Details</h3>
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 block">Role name</label>
                  <input
                    type="text"
                    value={isReadOnly ? (selectedRole?.name ?? '') : editName}
                    onChange={e => { setEditName(e.target.value); setIsDirty(true) }}
                    readOnly={isReadOnly}
                    placeholder="e.g. Branch Manager"
                    className={inputCls() + (isReadOnly ? ' opacity-60 cursor-default' : '')}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 block">Description</label>
                  <textarea
                    value={isReadOnly ? (selectedRole?.description ?? '') : editDesc}
                    onChange={e => { setEditDesc(e.target.value); setIsDirty(true) }}
                    readOnly={isReadOnly}
                    rows={2}
                    placeholder="Describe what this role can do..."
                    className={inputCls() + ' resize-none' + (isReadOnly ? ' opacity-60 cursor-default' : '')}
                  />
                </div>
              </div>

              {/* Permission matrix */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Permissions</h3>
                <PermMatrixEditor
                  matrix={isReadOnly ? buildMatrix(selectedRole?.permissions ?? []) : permMatrix}
                  scopes={isReadOnly ? buildScopes(selectedRole?.permissions ?? []) : branchScopes}
                  onChange={handleMatrixChange}
                  onScopeChange={handleScopeChange}
                  readOnly={isReadOnly}
                />
              </div>

              {/* Delete zone for custom roles */}
              {!isReadOnly && !isNew && (
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-red-200 dark:border-red-900/50 p-5">
                  <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Danger Zone
                  </h3>
                  {!showDeleteConfirm ? (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Permanently delete this role. Users assigned to it will need to be reassigned.</p>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0 ml-4"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete Role
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">Are you sure? This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">Cancel</button>
                        <button
                          onClick={handleDelete}
                          className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                        >
                          Confirm Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Save bar */}
            {!isReadOnly && (
              <div className={`shrink-0 border-t px-6 py-3 flex items-center justify-end gap-2 transition-colors ${
                isDirty
                  ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800'
                  : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
              }`}>
                <button
                  onClick={handleDiscard}
                  disabled={!isDirty}
                  className="px-4 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-40 transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={!isDirty || !editName.trim()}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    isDirty && editName.trim()
                      ? 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white shadow-sm shadow-violet-600/20'
                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  {isNew ? 'Create Role' : 'Save Changes'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
