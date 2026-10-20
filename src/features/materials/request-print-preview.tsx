import { useEffect, useRef, useState } from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { Button } from '#/components/ui/button'

GlobalWorkerOptions.workerSrc = workerUrl

/** Render a single page at a time, including in browsers without a native PDF plugin. */
export default function RequestPrintPreview({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [error, setError] = useState(''),
    [rendering, setRendering] = useState(true)
  useEffect(() => {
    let active = true
    const task = getDocument({ url, isEvalSupported: false })
    void task.promise
      .then((pdf) => {
        if (active) {
          setDocument(pdf)
          setPageNumber(1)
        }
      })
      .catch(() => {
        if (active)
          setError(
            'Не удалось показать страницы. Скачайте PDF или откройте его отдельно.',
          )
      })
    return () => {
      active = false
      void task.destroy()
    }
  }, [url])
  useEffect(() => {
    if (!document) return
    let active = true,
      task: RenderTask | undefined
    setRendering(true)
    void document
      .getPage(pageNumber)
      .then(async (page) => {
        if (!active || !canvas.current) return
        const viewport = page.getViewport({ scale: 2 })
        const target = canvas.current
        target.width = Math.ceil(viewport.width)
        target.height = Math.ceil(viewport.height)
        task = page.render({ canvas: target, viewport })
        await task.promise
        // Effect cleanup can change active while rendering is pending.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (active) setRendering(false)
      })
      .catch(() => {
        if (active) {
          setError(
            'Не удалось отобразить страницу. PDF доступен для скачивания.',
          )
          setRendering(false)
        }
      })
    return () => {
      active = false
      task?.cancel()
    }
  }, [document, pageNumber])
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded border border-slate-200 bg-slate-100">
      <div className="flex flex-wrap items-center justify-center gap-3 border-b bg-white p-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!document || pageNumber <= 1}
          onClick={() => setPageNumber((n) => n - 1)}
        >
          Предыдущая
        </Button>
        <span className="text-sm">
          Страница {pageNumber} из {document?.numPages ?? '…'}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={!document || pageNumber >= document.numPages}
          onClick={() => setPageNumber((n) => n + 1)}
        >
          Следующая
        </Button>
        {rendering && !error ? (
          <span role="status" className="text-sm text-slate-500">
            Отрисовка…
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {error ? (
          <p role="alert" className="p-4 text-red-700">
            {error}
          </p>
        ) : null}
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Страница PDF ${pageNumber}`}
          className={`mx-auto h-auto w-full max-w-6xl bg-white shadow ${rendering ? 'invisible' : ''}`}
        />
      </div>
    </div>
  )
}
