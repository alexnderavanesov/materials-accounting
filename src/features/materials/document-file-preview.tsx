import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
  X,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import type { DocumentFile } from './document-registry'

const PdfPages = lazy(() => import('./request-print-preview'))
export const documentFileUrl = (id: string) =>
  `/api/documents?file=${encodeURIComponent(id)}`

export function DocumentFilePreview({
  file,
  onClose,
  navigation,
}: {
  file: DocumentFile
  onClose: () => void
  navigation?: {
    index: number
    total: number
    onChange: (index: number) => void
  }
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [preview, setPreview] = useState<{ url: string; type: string } | null>(
    null,
  )
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.showModal()
    return () => {
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let url = ''
    setPreview(null)
    setError('')
    void (async () => {
      try {
        const response = await fetch(`${documentFileUrl(file.id)}&preview=1`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string
          } | null
          throw new Error(body?.error ?? 'Не удалось загрузить файл.')
        }
        const blob = await response.blob()
        if (controller.signal.aborted) return
        if (!['application/pdf', 'image/png', 'image/jpeg'].includes(blob.type))
          throw new Error('Сервер не вернул файл для предпросмотра.')
        url = URL.createObjectURL(blob)
        setPreview({ url, type: blob.type })
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Не удалось открыть файл.',
          )
      }
    })()
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [file.id, attempt])

  return createPortal(
    <dialog
      ref={dialog}
      aria-label={`Предпросмотр: ${file.name}`}
      onKeyDown={(event) => {
        if (!navigation || !['ArrowLeft', 'ArrowRight'].includes(event.key))
          return
        event.preventDefault()
        event.stopPropagation()
        const next = navigation.index + (event.key === 'ArrowLeft' ? -1 : 1)
        if (next >= 0 && next < navigation.total) navigation.onChange(next)
      }}
      onCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      className="m-auto h-[94dvh] max-h-[1100px] w-[min(1280px,96vw)] overflow-hidden rounded-xl border border-stone-200 bg-white p-0 text-stone-900 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-stone-200 p-4">
          <h2 className="mr-auto min-w-0 break-words text-lg font-semibold">
            {file.name}
          </h2>
          <a
            href={documentFileUrl(file.id)}
            download={file.name}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-stone-200 px-4 text-sm font-medium hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-stone-400"
          >
            <Download size={16} />
            Скачать оригинал
          </a>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Закрыть предпросмотр"
            onClick={onClose}
          >
            <X size={20} />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-3">
          {error ? (
            <div className="grid justify-items-start gap-3 p-4">
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
              <Button
                variant="outline"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Повторить
              </Button>
            </div>
          ) : !preview ? (
            <p
              role="status"
              className="flex items-center justify-center gap-2 p-8 text-sm text-stone-500"
            >
              <LoaderCircle size={18} className="animate-spin" />
              Подготовка предпросмотра…
            </p>
          ) : preview.type === 'application/pdf' ? (
            <Suspense fallback={<p role="status">Загрузка просмотра PDF…</p>}>
              <PdfPages key={preview.url} url={preview.url} />
            </Suspense>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md bg-stone-100 p-3">
              <img
                src={preview.url}
                alt={file.name}
                className="max-h-full max-w-full object-contain"
                onError={() =>
                  setError(
                    'Не удалось отобразить изображение. Исходный файл доступен для скачивания.',
                  )
                }
              />
            </div>
          )}
        </div>
        {navigation && (
          <div className="flex shrink-0 items-center justify-center gap-4 border-t border-stone-200 p-3">
            <Button
              variant="outline"
              size="icon"
              aria-label="Предыдущая фотография"
              disabled={navigation.index === 0}
              onClick={() => navigation.onChange(navigation.index - 1)}
            >
              <ChevronLeft size={20} />
            </Button>
            <span
              role="status"
              className="min-w-20 text-center text-sm tabular-nums text-stone-600"
            >
              {navigation.index + 1} из {navigation.total}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Следующая фотография"
              disabled={navigation.index === navigation.total - 1}
              onClick={() => navigation.onChange(navigation.index + 1)}
            >
              <ChevronRight size={20} />
            </Button>
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  )
}
