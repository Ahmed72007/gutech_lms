import { FileUp, Paperclip, X } from 'lucide-react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { cn, formatBytes } from '@/lib/utils'
import { Progress } from './primitives'

interface FileDropProps {
  file: File | null
  onFile: (file: File | null) => void
  accept?: string
  maxBytes: number
  hint: string
  progress?: number | null
  disabled?: boolean
  label?: string
}

/** Drag-and-drop or click-to-browse single file picker with client-side size check. */
export function FileDrop({ file, onFile, accept, maxBytes, hint, progress, disabled, label = 'Drop a file here or browse' }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function choose(next: File | undefined | null) {
    setError(null)
    if (!next) return
    if (next.size > maxBytes) {
      setError(`That file is ${formatBytes(next.size)}. The limit is ${formatBytes(maxBytes)}.`)
      return
    }
    onFile(next)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (!disabled) choose(event.dataTransfer.files[0])
  }

  if (file) {
    return (
      <div className="rounded-xl border bg-muted/40 p-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <Paperclip className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
          </div>
          {!disabled && (
            <button type="button" onClick={() => onFile(null)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Remove file">
              <X className="size-4" />
            </button>
          )}
        </div>
        {progress !== null && progress !== undefined && <Progress value={progress} className="mt-3" />}
      </div>
    )
  }

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors',
          dragging ? 'border-primary bg-primary-soft' : 'border-input hover:border-primary/60 hover:bg-muted/50',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        <div className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary">
          <FileUp className="size-5" />
        </div>
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          choose(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export const DOCUMENT_ACCEPT = '.pdf,.docx,.pptx,.zip,.png,.jpg,.jpeg,.gif,.webp'
export const DOCUMENT_HINT = 'PDF, DOCX, PPTX, ZIP or images · up to 25 MB'
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
