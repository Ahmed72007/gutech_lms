import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, MailCheck, MoreHorizontal, Pencil, Search, UserPlus, Users, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader, RoleBadge } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, fieldAria, Input, Select } from '@/components/ui/input'
import { Avatar, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Switch, Table, TableWrap, Td, Th } from '@/components/ui/primitives'
import { EmptyState, ListSkeleton, Pagination, QueryState } from '@/components/ui/states'
import { useUser } from '@/features/auth/AuthProvider'
import { passwordPolicy } from '@/features/auth/PasswordPages'
import { ApiError, errorMessage } from '@/lib/api'
import { useDebounced } from '@/lib/hooks'
import type { AdminUser, Role } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { useCreateUser, useResetUserPassword, useUpdateUser, useUsers, type UserFilters } from './api'

/** Readable temporary password that satisfies the policy. */
function generatePassword() {
  const words = ['Lagoon', 'Falcon', 'Cedar', 'Harbor', 'Summit', 'Oasis', 'Comet', 'Amber']
  const pick = () => words[Math.floor(Math.random() * words.length)]
  const digits = String(crypto.getRandomValues(new Uint32Array(1))[0] ?? 0).slice(-4).padStart(4, '7')
  return `${pick()}-${pick()}-${digits}`
}

const createSchema = z
  .object({
    fullName: z.string().trim().min(2, 'At least 2 characters').max(120),
    email: z.string().trim().email('Enter a valid email'),
    role: z.enum(['admin', 'teacher', 'student']),
    rollNo: z.string().trim().max(40).optional(),
    tempPassword: passwordPolicy,
  })
  .refine((v) => v.role !== 'student' || (v.rollNo ?? '').length > 0, { message: 'Students need a roll number', path: ['rollNo'] })
type CreateValues = z.infer<typeof createSchema>

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateUser()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm<CreateValues>({ resolver: zodResolver(createSchema), defaultValues: { role: 'student', tempPassword: generatePassword() } })
  const role = watch('role')

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await create.mutateAsync({ ...values, rollNo: values.role === 'student' ? values.rollNo : undefined })
      toast.info(`Share the temporary password securely: ${values.tempPassword}`, { duration: 15000 })
      reset({ role: 'student', tempPassword: generatePassword() })
      onOpenChange(false)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_TAKEN') setFieldError('email', { message: e.message })
      else setError(errorMessage(e))
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>The user signs in with the temporary password and must change it immediately.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Full name" htmlFor="u-name" error={errors.fullName?.message} required>
            <Input {...fieldAria('u-name', errors.fullName?.message)} {...register('fullName')} />
          </Field>
          <Field label="Email" htmlFor="u-email" error={errors.email?.message} required>
            <Input type="email" {...fieldAria('u-email', errors.email?.message)} {...register('email')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" htmlFor="u-role">
              <Select id="u-role" {...register('role')}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            {role === 'student' && (
              <Field label="Roll number" htmlFor="u-roll" error={errors.rollNo?.message} required>
                <Input {...fieldAria('u-roll', errors.rollNo?.message)} {...register('rollNo')} />
              </Field>
            )}
          </div>
          <Field label="Temporary password" htmlFor="u-pass" error={errors.tempPassword?.message} hint="At least 10 characters with a letter and a number.">
            <div className="flex gap-2">
              <Input className="font-mono" {...fieldAria('u-pass', errors.tempPassword?.message)} {...register('tempPassword')} />
              <Button type="button" variant="outline" size="icon" onClick={() => setValue('tempPassword', generatePassword())} aria-label="Generate password">
                <Wand2 />
              </Button>
            </div>
          </Field>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              <UserPlus /> Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const update = useUpdateUser()
  const [fullName, setFullName] = useState(user.fullName)
  const [role, setRole] = useState<Role>(user.role)
  const [rollNo, setRollNo] = useState(user.rollNo ?? '')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {user.fullName}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            await update.mutateAsync({ id: user.id, fullName: fullName.trim(), role, rollNo: role === 'student' ? rollNo.trim() || null : undefined })
            toast.success('User updated')
            onClose()
          }}
        >
          <Field label="Full name" htmlFor="e-name">
            <Input id="e-name" value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={2} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" htmlFor="e-role">
              <Select id="e-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            {role === 'student' && (
              <Field label="Roll number" htmlFor="e-roll">
                <Input id="e-roll" value={rollNo} onChange={(e) => setRollNo(e.target.value)} />
              </Field>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={update.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const reset = useResetUserPassword()
  const [mode, setMode] = useState<'email' | 'temp'>('email')
  const [temp, setTemp] = useState(generatePassword())
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>For {user.fullName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {(['email', 'temp'] as const).map((m) => (
            <label key={m} className="flex cursor-pointer gap-3 rounded-xl border p-3.5 has-[:checked]:border-primary has-[:checked]:bg-primary-soft/50">
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-1 accent-[hsl(var(--primary))]" />
              <span>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {m === 'email' ? <MailCheck className="size-4" /> : <KeyRound className="size-4" />}
                  {m === 'email' ? 'Email a reset link' : 'Set a temporary password'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {m === 'email' ? `Sends a one-hour link to ${user.email}.` : 'Signs the user out everywhere; they must change it at next sign-in.'}
                </span>
              </span>
            </label>
          ))}
          {mode === 'temp' && <Input className="font-mono" value={temp} onChange={(e) => setTemp(e.target.value)} aria-label="Temporary password" />}
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={reset.isPending}
            onClick={async () => {
              setError(null)
              try {
                await reset.mutateAsync({ id: user.id, mode, tempPassword: mode === 'temp' ? temp : undefined })
                onClose()
              } catch (e) {
                setError(errorMessage(e))
              }
            }}
          >
            {mode === 'email' ? 'Send link' : 'Set password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function UsersPage() {
  const me = useUser()
  const [filters, setFilters] = useState<UserFilters>({ page: 1, search: '', role: '', status: '' })
  const search = useDebounced(filters.search.trim())
  const query = useUsers({ ...filters, search })
  const update = useUpdateUser()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [resetting, setResetting] = useState<AdminUser | null>(null)

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="Create accounts, change roles and deactivate access. There is no public sign-up."
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus /> New user
          </Button>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_160px_160px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
            placeholder="Search name, email or roll no."
            className="pl-9"
            aria-label="Search users"
          />
        </div>
        <Select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value as Role | '', page: 1 })} aria-label="Role">
          <option value="">All roles</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="admin">Admins</option>
        </Select>
        <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as UserFilters['status'], page: 1 })} aria-label="Status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </Select>
      </div>
      <QueryState
        query={query}
        loading={<ListSkeleton rows={8} />}
        isEmpty={(r) => r.data.length === 0}
        empty={<EmptyState icon={Users} title="No users found" description="Try a different search or filter." />}
      >
        {({ data, meta }) => (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>User</Th>
                    <Th>Role</Th>
                    <Th className="hidden md:table-cell">Roll no.</Th>
                    <Th className="hidden lg:table-cell">Created</Th>
                    <Th>Active</Th>
                    <Th className="w-12">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((u) => (
                    <tr key={u.id} className={u.isActive ? '' : 'opacity-60'}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.fullName} className="size-9" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {u.fullName} {u.id === me.id && <span className="text-xs text-muted-foreground">(you)</span>}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                          </div>
                          {u.mustChangePassword && (
                            <Badge variant="warning" className="hidden xl:inline-flex">
                              Temp password
                            </Badge>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <RoleBadge role={u.role} />
                      </Td>
                      <Td className="hidden text-muted-foreground md:table-cell">{u.rollNo ?? '—'}</Td>
                      <Td className="hidden text-muted-foreground lg:table-cell">{formatDate(u.createdAt)}</Td>
                      <Td>
                        <Switch
                          checked={u.isActive}
                          disabled={u.id === me.id || update.isPending}
                          onCheckedChange={(v) =>
                            update.mutate(
                              { id: u.id, isActive: v },
                              { onSuccess: () => toast.success(v ? `${u.fullName} reactivated` : `${u.fullName} deactivated and signed out`) },
                            )
                          }
                          aria-label={`${u.isActive ? 'Deactivate' : 'Activate'} ${u.fullName}`}
                        />
                      </Td>
                      <Td>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.fullName}`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing(u)}>
                              <Pencil /> Edit details
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setResetting(u)}>
                              <KeyRound /> Reset password
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={(page) => setFilters({ ...filters, page })} />
          </>
        )}
      </QueryState>
      <CreateUserDialog open={creating} onOpenChange={setCreating} />
      {editing && <EditUserDialog user={editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </>
  )
}
