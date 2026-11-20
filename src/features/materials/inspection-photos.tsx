import { useEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { documentFileSelectionError } from './document-file-limits'
import { fileBase64 } from './request-print-ui'
import { DocumentPhotoThumbnail } from './document-photo-thumbnail'
import { isDocumentPhoto } from './document-registry'
import type {
  DocumentFile,
  DocumentFileManifest,
  DocumentRegistry,
} from './document-registry'

type Catalog = DocumentRegistry & {
  manifest: DocumentFileManifest
  workspaceRevision: string
}
const endpoint = '/api/documents'
export const inspectionPhotoDocumentId = (caseId: string, revision: number) =>
  JSON.stringify(['avk', caseId, revision])
const photoUrl = (id: string) => `${endpoint}?file=${encodeURIComponent(id)}`
const fileKey = (file: File) =>
  JSON.stringify([file.name, file.size, file.lastModified])
export function inspectionPhotoError(files: File[]) {
  const invalid = files.find((file) => !isDocumentPhoto(file))
  return invalid
    ? `${invalid.name}: выберите фотографию в формате JPEG или PNG.`
    : documentFileSelectionError(files)
}
async function checked(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? 'Не удалось загрузить фотоматериалы.')
  }
  return response
}
async function loadCatalog(signal?: AbortSignal): Promise<Catalog> {
  return (
    await checked(await fetch(endpoint, { cache: 'no-store', signal }))
  ).json()
}

/** The caller must persist the AVK and await its workspace save before uploading. */
export async function uploadInspectionPhotos(
  documentId: string,
  files: File[],
) {
  const error = inspectionPhotoError(files)
  if (error) throw new Error(error)
  if (!files.length) return
  const uploads = []
  for (const file of files)
    uploads.push({ name: file.name, base64: await fileBase64(file) })
  const catalog = await loadCatalog()
  if (
    !catalog.documents.some(
      (doc) => doc.id === documentId && doc.kind === 'avk',
    )
  )
    throw new Error(
      'Сохранённый АВК не найден в документах. Проверьте сохранение и повторите загрузку.',
    )
  await checked(
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upload-files',
        documentId,
        workspaceRevision: catalog.workspaceRevision,
        filesRevision: catalog.manifest.revision,
        files: uploads,
      }),
    }),
  )
}

export function InspectionPhotoPicker({
  documentId,
  initialFiles,
  readOnly = false,
  onConfirm,
  onCancel,
}: {
  documentId: string
  initialFiles: File[]
  readOnly?: boolean
  onConfirm: (files: File[]) => void
  onCancel: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState(initialFiles)
  const [stored, setStored] = useState<DocumentFile[]>([])
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [dragging, setDragging] = useState(false)
  const error = inspectionPhotoError(files)

  useEffect(() => {
    const abort = new AbortController()
    setLoading(true)
    setLoadError('')
    void loadCatalog(abort.signal)
      .then((catalog) => {
        if (!abort.signal.aborted)
          setStored(
            catalog.manifest.files.filter(
              (file) => file.documentId === documentId && isDocumentPhoto(file),
            ),
          )
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted)
          setLoadError(
            cause instanceof Error
              ? cause.message
              : 'Не удалось прочитать фотографии.',
          )
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false)
      })
    return () => abort.abort()
  }, [documentId, refresh])

  useEffect(() => {
    const next = files
      .filter(isDocumentPhoto)
      .map((file) => ({ file, url: URL.createObjectURL(file) }))
    setPreviews(next)
    return () => next.forEach(({ url }) => URL.revokeObjectURL(url))
  }, [files])

  function add(selected: FileList | null) {
    if (readOnly || !selected?.length) return
    const unique = new Map(files.map((file) => [fileKey(file), file]))
    for (const file of Array.from(selected)) unique.set(fileKey(file), file)
    setFiles([...unique.values()])
  }
  return (
    <div className="grid gap-4">
      {loading && (
        <p role="status" className="text-sm text-stone-500">
          Проверяем прикреплённые фотографии…
        </p>
      )}
      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 text-sm text-red-700"
        >
          <span>{loadError}</span>
          <Button
            variant="outline"
            onClick={() => setRefresh((current) => current + 1)}
          >
            Повторить загрузку списка
          </Button>
        </div>
      )}
      {stored.length > 0 && (
        <div className="grid gap-2">
          <h3 className="font-medium">Прикреплено к АВК: {stored.length}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {stored.map((file) => (
              <a
                key={file.id}
                href={photoUrl(file.id)}
                className="overflow-hidden rounded-lg border border-stone-200"
                title={`Скачать: ${file.name}`}
              >
                <DocumentPhotoThumbnail
                  file={file}
                  alt={file.name}
                  className="h-32 w-full"
                />
                <span className="block break-words p-2 text-xs text-stone-600">
                  {file.name}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
      {!readOnly && (
        <>
          <input
            ref={input}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            aria-label="Фотографии АВК"
            className="hidden"
            onChange={(event) => {
              add(event.currentTarget.files)
              event.currentTarget.value = ''
            }}
          />
          <button
            type="button"
            aria-label="Выбрать фотографии"
            onClick={() => input.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              add(event.dataTransfer.files)
            }}
            className={`flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-5 text-center outline-none focus-visible:ring-2 focus-visible:ring-stone-300 ${dragging ? 'border-stone-500 bg-stone-100' : 'border-stone-200 bg-stone-50 hover:border-stone-400'}`}
          >
            <ImagePlus size={28} className="text-stone-500" />
            <span className="text-sm font-medium">
              Выберите фотографии или перетащите их сюда
            </span>
            <span className="text-xs text-stone-500">
              JPEG, PNG · до 20 МБ каждый · до 50 фотографий и 100 МБ за раз
            </span>
          </button>
          {files.length > 0 && (
            <div className="grid gap-2">
              <h3 className="font-medium">
                Выбрано для загрузки: {files.length}
              </h3>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {files.map((file) => (
                  <li
                    key={fileKey(file)}
                    className="relative overflow-hidden rounded-lg border border-stone-200"
                  >
                    {previews.find((item) => item.file === file) ? (
                      <img
                        src={previews.find((item) => item.file === file)!.url}
                        alt={file.name}
                        className="h-32 w-full bg-stone-50 object-contain"
                      />
                    ) : (
                      <div className="h-32 bg-stone-50" />
                    )}
                    <button
                      type="button"
                      aria-label={`Убрать фотографию: ${file.name}`}
                      className="absolute right-1 top-1 rounded-md border border-stone-200 bg-white p-1.5 text-stone-600 hover:bg-stone-100"
                      onClick={() =>
                        setFiles((current) =>
                          current.filter((item) => item !== file),
                        )
                      }
                    >
                      <X size={16} />
                    </button>
                    <span className="block break-words p-2 text-xs text-stone-600">
                      {file.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {!loading &&
        !loadError &&
        !stored.length &&
        !files.length &&
        readOnly && (
          <p className="text-sm text-stone-500">
            Фотографии к этой редакции АВК ещё не прикреплены.
          </p>
        )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {!readOnly && (
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
        )}
        <Button
          disabled={!readOnly && (!!error || (!files.length && !stored.length))}
          onClick={() => (readOnly ? onCancel() : onConfirm(files))}
        >
          {readOnly ? 'Закрыть' : 'Готово'}
        </Button>
      </div>
    </div>
  )
}
