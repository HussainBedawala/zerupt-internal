import { useState } from 'react'
import {
  Plus, Search, MoreHorizontal, Mail, Clock, Shield,
  CheckCircle2, XCircle, Send, UserX, ChevronDown,
  X, User, AlertTriangle, RefreshCw, Copy,
} from 'lucide-react'
import type { User as TeamUser, Role, Branch } from '../../types'

interface TeamPanelProps {
  users: TeamUser[]
  roles: Role[]
  branches: Branch[]
  onInviteUser?: (email: string, roleId: string, branchAccess: 'all' | string[]) => void
  onUpdateUser?: (userId: string, data: Partial<TeamUser>) => void
  onResendInvite?: (userId: string) => void
  onRevokeInvite?: (userId: string) => void
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, inviteStatus }: { status: TeamUser['status']; inviteStatus: TeamUser['inviteStatus'] }) {
  if (inviteStatus === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
        <Send className="w-3 h-3" /> Invited
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
        <CheckCircle2 className="w-3 h-3" /> Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
      <XCircle className="w-3 h-3" /> Inactive
    </span>
  )
}

// ─── Branch access label ──────────────────────────────────────────────────────

function BranchAccessLabel({ access, branches }: { access: TeamUser['branchAccess']; branches: Branch[] }) {
  if (access === 'all') {
    return <span className="text-xs text-violet-600 dark:text-violet-400 font-medium">All branches</span>
  }
  const count = (access as string[]).length
  if (count === 0) return <span className="text-xs text-zinc-400 dark:text-zinc-500">No branches</span>
  if (count === 1) {
    const branch = branches.find(b => b.id === (access as string[])[0])
    return <span className="text-xs text-zinc-600 dark:text-zinc-400">{branch?.name ?? 'Unknown'}</span>
  }
  return <span className="text-xs text-zinc-600 dark:text-zinc-400">{count} branches</span>
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = [
    'bg-violet-500', 'bg-teal-500', 'bg-amber-500', 'bg-rose-500',
    'bg-indigo-500', 'bg-cyan-500', 'bg-pink-500', 'bg-emerald-500',
  ]
  const color = colors[name.charCodeAt(0) % colors.length]
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}>
      {initials}
    </div>
  )
}

// ─── User action menu ─────────────────────────────────────────────────────────

interface UserMenuProps {
  user: TeamUser
  onEdit: () => void
  onResendInvite?: () => void
  onRevokeInvite?: () => void
  onDeactivate?: () => void
  onReactivate?: () => void
}

function UserActionMenu({ user, onEdit, onResendInvite, onRevokeInvite, onDeactivate, onReactivate }: UserMenuProps) {
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
            <button
              onClick={() => { onEdit(); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
            >
              Edit user
            </button>
            {user.inviteStatus === 'pending' && (
              <>
                <button
                  onClick={() => { onResendInvite?.(); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-3 h-3" /> Resend invite
                </button>
                <button
                  onClick={() => { onRevokeInvite?.(); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  Revoke invite
                </button>
              </>
            )}
            {user.status === 'active' && user.inviteStatus === 'accepted' && (
              <button
                onClick={() => { onDeactivate?.(); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-2"
              >
                <UserX className="w-3 h-3" /> Deactivate user
              </button>
            )}
            {user.status === 'inactive' && (
              <button
                onClick={() => { onReactivate?.(); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors"
              >
                Reactivate user
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Invite modal ─────────────────────────────────────────────────────────────

interface InviteModalProps {
  roles: Role[]
  branches: Branch[]
  onClose: () => void
  onInvite?: (email: string, roleId: string, branchAccess: 'all' | string[]) => void
}

function InviteModal({ roles, branches, onClose, onInvite }: InviteModalProps) {
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState(roles[1]?.id ?? '')
  const [accessType, setAccessType] = useState<'all' | 'specific'>('all')
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [step, setStep] = useState<'form' | 'sent'>('form')

  function toggleBranch(id: string) {
    setSelectedBranches(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    )
  }

  function handleSend() {
    if (!email || !roleId) return
    onInvite?.(email, roleId, accessType === 'all' ? 'all' : selectedBranches)
    setStep('sent')
  }

  const isValid = email.includes('@') && roleId && (accessType === 'all' || selectedBranches.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl w-full max-w-md overflow-hidden">
        {step === 'sent' ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-100 dark:bg-teal-950 flex items-center justify-center mx-auto mb-4">
              <Send className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            </div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Invitation sent!</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
              An invite was sent to <strong>{email}</strong>. They'll appear as "Invited" until they accept.
            </p>
            <button
              onClick={onClose}
              className="mt-5 w-full py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Invite Team Member</h3>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 block">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 block">Role</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <select
                    value={roleId}
                    onChange={e => setRoleId(e.target.value)}
                    className="w-full appearance-none pl-9 pr-8 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                </div>
                {roleId && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                    {roles.find(r => r.id === roleId)?.description}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 block">Branch Access</label>
                <div className="flex gap-2 mb-2">
                  {(['all', 'specific'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setAccessType(type)}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                        accessType === type
                          ? 'bg-violet-100 dark:bg-violet-950 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'
                      }`}
                    >
                      {type === 'all' ? 'All branches' : 'Specific branches'}
                    </button>
                  ))}
                </div>
                {accessType === 'specific' && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {branches.map(branch => (
                      <label
                        key={branch.id}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-violet-300 dark:hover:border-violet-700 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedBranches.includes(branch.id)}
                          onChange={() => toggleBranch(branch.id)}
                          className="accent-violet-600 w-3.5 h-3.5"
                        />
                        <span className="text-xs text-zinc-700 dark:text-zinc-300">{branch.name}</span>
                        <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${
                          branch.status === 'active'
                            ? 'bg-teal-100 dark:bg-teal-950 text-teal-600 dark:text-teal-400'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                        }`}>
                          {branch.status}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!isValid}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                  isValid
                    ? 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white shadow-sm shadow-violet-600/20'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                }`}
              >
                Send Invitation
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Edit user slide-over ─────────────────────────────────────────────────────

interface EditUserProps {
  user: TeamUser
  roles: Role[]
  branches: Branch[]
  onClose: () => void
  onSave?: (userId: string, data: Partial<TeamUser>) => void
}

function EditUserPanel({ user, roles, branches, onClose, onSave }: EditUserProps) {
  const [roleId, setRoleId] = useState(user.roleId)
  const [accessType, setAccessType] = useState<'all' | 'specific'>(user.branchAccess === 'all' ? 'all' : 'specific')
  const [selectedBranches, setSelectedBranches] = useState<string[]>(
    Array.isArray(user.branchAccess) ? user.branchAccess : []
  )
  const isDirty = roleId !== user.roleId || accessType !== (user.branchAccess === 'all' ? 'all' : 'specific') ||
    (accessType === 'specific' && JSON.stringify(selectedBranches.sort()) !== JSON.stringify(([...user.branchAccess as string[]]).sort()))

  function toggleBranch(id: string) {
    setSelectedBranches(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id])
  }

  function handleSave() {
    onSave?.(user.id, {
      roleId,
      role: roles.find(r => r.id === roleId)?.name ?? user.role,
      branchAccess: accessType === 'all' ? 'all' : selectedBranches,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 dark:bg-black/60" onClick={onClose} />
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size="md" />
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{user.name}</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div>
            <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 block">Role</label>
            <div className="relative">
              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
              <select
                value={roleId}
                onChange={e => setRoleId(e.target.value)}
                className="w-full appearance-none pl-9 pr-8 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
              >
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            </div>
            {roleId && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                {roles.find(r => r.id === roleId)?.description}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 block">Branch Access</label>
            <div className="flex gap-2 mb-2">
              {(['all', 'specific'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setAccessType(type)}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    accessType === type
                      ? 'bg-violet-100 dark:bg-violet-950 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {type === 'all' ? 'All branches' : 'Specific'}
                </button>
              ))}
            </div>
            {accessType === 'specific' && (
              <div className="space-y-1.5">
                {branches.map(branch => (
                  <label key={branch.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-violet-300 dark:hover:border-violet-700 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedBranches.includes(branch.id)}
                      onChange={() => toggleBranch(branch.id)}
                      className="accent-violet-600 w-3.5 h-3.5"
                    />
                    <span className="text-xs text-zinc-700 dark:text-zinc-300">{branch.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Activity</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Member since</span>
                <span className="text-xs text-zinc-700 dark:text-zinc-300">{new Date(user.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Last login</span>
                <span className="text-xs text-zinc-700 dark:text-zinc-300">
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Status</span>
                <StatusBadge status={user.status} inviteStatus={user.inviteStatus} />
              </div>
            </div>
          </div>
        </div>

        <div className={`shrink-0 border-t px-5 py-3 flex items-center justify-end gap-2 transition-colors ${
          isDirty ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800' : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800'
        }`}>
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
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

// ─── Main component ────────────────────────────────────────────────────────────

export function TeamPanel({ users, roles, branches, onInviteUser, onUpdateUser, onResendInvite, onRevokeInvite }: TeamPanelProps) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'invited'>('all')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editingUser, setEditingUser] = useState<TeamUser | null>(null)

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'invited' && u.inviteStatus === 'pending') ||
      (filterStatus === 'active' && u.status === 'active' && u.inviteStatus !== 'pending') ||
      (filterStatus === 'inactive' && u.status === 'inactive')
    return matchSearch && matchStatus
  })

  const counts = {
    all: users.length,
    active: users.filter(u => u.status === 'active' && u.inviteStatus !== 'pending').length,
    inactive: users.filter(u => u.status === 'inactive').length,
    invited: users.filter(u => u.inviteStatus === 'pending').length,
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl space-y-5">

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, or role…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors"
            />
          </div>

          {/* Invite button */}
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white rounded-lg transition-colors shadow-sm shadow-violet-600/20 shrink-0"
          >
            <Plus className="w-4 h-4" /> Invite User
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg w-fit">
          {(['all', 'active', 'invited', 'inactive'] as const).map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filterStatus === status
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                filterStatus === status
                  ? 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300'
                  : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
              }`}>
                {counts[status]}
              </span>
            </button>
          ))}
        </div>

        {/* User table */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_32px] gap-3 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
            {['User', 'Role', 'Access', 'Status', ''].map((h, i) => (
              <span key={i} className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <User className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No users found</p>
            </div>
          ) : (
            filtered.map(user => (
              <div
                key={user.id}
                className={`grid grid-cols-[2fr_1.5fr_1fr_1fr_32px] gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 items-center transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/30 ${
                  user.status === 'inactive' ? 'opacity-60' : ''
                }`}
              >
                {/* User info */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={user.name} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{user.name}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{user.email}</p>
                  </div>
                </div>

                {/* Role */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <Shield className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{user.role}</span>
                </div>

                {/* Branch access */}
                <div>
                  <BranchAccessLabel access={user.branchAccess} branches={branches} />
                </div>

                {/* Status */}
                <div>
                  <StatusBadge status={user.status} inviteStatus={user.inviteStatus} />
                </div>

                {/* Actions */}
                <UserActionMenu
                  user={user}
                  onEdit={() => setEditingUser(user)}
                  onResendInvite={() => onResendInvite?.(user.id)}
                  onRevokeInvite={() => onRevokeInvite?.(user.id)}
                  onDeactivate={() => onUpdateUser?.(user.id, { status: 'inactive' })}
                  onReactivate={() => onUpdateUser?.(user.id, { status: 'active' })}
                />
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-zinc-400 dark:text-zinc-500 px-1">
          {filtered.length} of {users.length} users shown
        </p>
      </div>

      {showInviteModal && (
        <InviteModal
          roles={roles}
          branches={branches}
          onClose={() => setShowInviteModal(false)}
          onInvite={(email, roleId, access) => {
            onInviteUser?.(email, roleId, access)
            setShowInviteModal(false)
          }}
        />
      )}

      {editingUser && (
        <EditUserPanel
          user={editingUser}
          roles={roles}
          branches={branches}
          onClose={() => setEditingUser(null)}
          onSave={(userId, data) => {
            onUpdateUser?.(userId, data)
            setEditingUser(null)
          }}
        />
      )}
    </div>
  )
}
