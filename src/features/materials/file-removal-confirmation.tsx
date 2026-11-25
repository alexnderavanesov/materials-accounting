import { Button } from '#/components/ui/button'
import { EscapeLayer } from '#/components/ui/escape-layer'
import type { DocumentFile } from './document-registry'

export function FileRemovalConfirmation({
  file,
  busy,
  onCancel,
  onConfirm,
}: {
  file: DocumentFile
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <EscapeLayer
      onEscape={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        role="group"
        aria-label={`Удаление файла ${file.name}`}
        className="grid w-full gap-2 rounded-md border border-red-100 bg-red-50/60 p-3"
      >
        <p className="text-sm wrap-anywhere text-stone-700">
          Сразу удалить «{file.name}» из документа?
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            Отмена
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-red-700 text-white hover:bg-red-800"
            disabled={busy}
            onClick={onConfirm}
          >
            Удалить файл
          </Button>
        </div>
      </div>
    </EscapeLayer>
  )
}
