import { Download, FileArchive, FileImage, FileText, FolderOpen, Presentation, Search, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DOCUMENT_ACCEPT, DOCUMENT_HINT, FileDrop, MAX_DOCUMENT_BYTES } from '@/components/ui/file-drop'
import { Field, Input, Textarea } from '@/components/ui/input'
import { EmptyState, ListSkeleton, Pagination, QueryState } from '@/components/ui/states'
import { useUser } from '@/features/auth/AuthProvider'
import { useDebounced } from '@/lib/hooks'
import { downloadSigned, errorMessage } from '@/lib/api'
import type { Resource } from '@/lib/types'
import { formatBytes, formatDate } from '@/lib/utils'
import { useDeleteResource, useResources, useUploadResource } from '@/features/courses/api'

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return { Icon: FileImage, tone: 'bg-info-soft text-info' }
  if (mime.includes('presentation')) return { Icon: Presentation, tone: 'bg-accent-soft text-accent' }
  if (mime.includes('zip')) return { Icon: FileArchive, tone: 'bg-muted text-muted-foreground' }
  return { Icon: FileText, tone: 'bg-primary-soft text-primary' }
}

function UploadDialog({ courseId, open, onOpenChange }: { courseId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const upload = useUploadResource(courseId)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setFile(null)
    setTitle('')
    setDescription('')
    setProgress(null)
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return setError('Choose a file to upload.')
    if (title.trim().length < 2) return setError('Give the resource a title.')
    const form = new FormData()
    form.append('title', title.trim())
    if (description.trim()) form.append('description', description.trim())
    form.append('file', file)
    setError(null)
    setProgress(0)
    try {
      await upload.mutateAsync({ form, onProgress: setProgress })
      reset()
      onOpenChange(false)
    } catch (err) {
      setProgress(null)
      setError(errorMessage(err))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!upload.isPending) {
          onOpenChange(o)
          if (!o) reset()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a resource</DialogTitle>
          <DialogDescription>Students enrolled in this course can download it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FileDrop
            file={file}
            onFile={(f) => {
              setFile(f)
              if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))
            }}
            accept={DOCUMENT_ACCEPT}
            maxBytes={MAX_DOCUMENT_BYTES}
            hint={DOCUMENT_HINT}
            progress={progress}
            disabled={upload.isPending}
          />
          <Field label="Title" htmlFor="res-title" required>
            <Input id="res-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Description" htmlFor="res-desc" hint="Optional">
            <Textarea id="res-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} />
          </Field>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={upload.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={upload.isPending}>
              <Upload /> Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ResourcesTab({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const user = useUser()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search.trim())
  const query = useResources(courseId, page, debounced)
  const remove = useDeleteResource(courseId)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Resource | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  async function download(resource: Resource) {
    setDownloading(resource.id)
    try {
      await downloadSigned(`/resources/${resource.id}/download`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search by title"
            className="pl-9"
            aria-label="Search resources"
          />
        </div>
        {canManage && (
          <Button onClick={() => setUploadOpen(true)}>
            <Upload /> Upload resource
          </Button>
        )}
      </div>

      <QueryState
        query={query}
        loading={<ListSkeleton rows={5} />}
        isEmpty={(r) => r.data.length === 0}
        empty={
          <EmptyState
            icon={FolderOpen}
            title={debounced ? 'No matching resources' : 'No resources yet'}
            description={canManage ? 'Upload slides, readings and other files for your students.' : 'Your teacher has not shared any files yet.'}
            action={
              canManage && !debounced ? (
                <Button onClick={() => setUploadOpen(true)}>
                  <Upload /> Upload the first one
                </Button>
              ) : undefined
            }
          />
        }
      >
        {({ data, meta }) => (
          <>
            <ul className="grid gap-3 md:grid-cols-2">
              {data.map((r) => {
                const { Icon, tone } = fileIcon(r.mimeType)
                const canDelete = user.role === 'admin' || r.uploadedBy?.id === user.id
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-soft transition hover:shadow-lift sm:p-4">
                    <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatBytes(r.sizeBytes)} · {formatDate(r.createdAt)}
                        {r.uploadedBy && ` · ${r.uploadedBy.fullName}`}
                      </p>
                      {r.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{r.description}</p>}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void download(r)} loading={downloading === r.id} aria-label={`Download ${r.title}`}>
                      {downloading !== r.id && <Download />}
                      <span className="hidden sm:inline">Download</span>
                    </Button>
                    {canManage && canDelete && (
                      <Button variant="danger-ghost" size="icon-sm" onClick={() => setToDelete(r)} aria-label={`Delete ${r.title}`}>
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
            <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={setPage} />
          </>
        )}
      </QueryState>

      <UploadDialog courseId={courseId} open={uploadOpen} onOpenChange={setUploadOpen} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this resource?"
        description={`“${toDelete?.title}” and its file will be permanently removed.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => (toDelete ? remove.mutateAsync(toDelete.id) : undefined)}
      />
    </div>
  )
}
