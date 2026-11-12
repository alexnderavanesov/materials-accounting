import { useState } from 'react'
import { Download, FileText, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { DocumentFilePreview, documentFileUrl } from './document-file-preview'
import { DocumentPhotoThumbnail } from './document-photo-thumbnail'
import type { DocumentFile } from './document-registry'

export function DocumentAttachments({
  files,
  photos,
  busy,
  onRemove,
}: {
  files: DocumentFile[]
  photos: boolean
  busy: boolean
  onRemove: (file: DocumentFile) => Promise<void>
}) {
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const previewIndex = files.findIndex((file) => file.id === previewId)
  const preview = files[previewIndex]
  return (
    <>
      {!files.length && (
        <p className="py-10 text-center text-sm text-stone-500">
          {photos
            ? 'Фотографии пока не прикреплены.'
            : 'Других файлов пока нет.'}
        </p>
      )}
      <ul
        aria-label={photos ? 'Фотографии документа' : 'Другие файлы документа'}
        className={
          photos
            ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'
            : 'grid gap-2'
        }
      >
        {files.map((file) => (
          <li
            key={file.id}
            className={`min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-white ${photos ? '' : 'flex flex-wrap items-center gap-2 p-2'}`}
          >
            <button
              type="button"
              aria-label={`Просмотр файла: ${file.name}`}
              onClick={() => setPreviewId(file.id)}
              className={`group cursor-pointer text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stone-500 ${photos ? 'block w-full' : 'flex min-w-0 flex-1 items-center gap-3 p-2'}`}
            >
              {photos ? (
                <DocumentPhotoThumbnail file={file} />
              ) : (
                <FileText size={20} className="shrink-0 text-stone-400" />
              )}
              <span
                title={file.name}
                className={
                  photos
                    ? 'block truncate px-3 pt-3 text-sm font-medium'
                    : 'break-words text-sm text-blue-700 group-hover:underline'
                }
              >
                {file.name}
              </span>
            </button>
            <div
              className={`flex items-center gap-1 ${photos ? 'px-2 py-1' : ''}`}
            >
              {photos && (
                <span className="mr-auto pl-1 text-xs text-stone-500">
                  {(file.size / 1024 / 1024).toLocaleString('ru-RU', {
                    maximumFractionDigits: 1,
                  })}{' '}
                  МБ
                </span>
              )}
              <a
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-stone-400"
                href={documentFileUrl(file.id)}
                download={file.name}
                title="Скачать оригинал"
                aria-label={`Скачать файл: ${file.name}`}
              >
                <Download size={16} />
              </a>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Удалить файл ${file.name}`}
                disabled={busy}
                onClick={() => setConfirmRemove(file.id)}
              >
                <Trash2 size={16} />
              </Button>
            </div>
            {confirmRemove === file.id && (
              <div className="grid w-full gap-2 border-t border-stone-200 bg-stone-50 p-2">
                <p className="text-xs text-stone-600">
                  Удалить вложение из документа?
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      void onRemove(file)
                      setConfirmRemove(null)
                    }}
                  >
                    Удалить файл
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setConfirmRemove(null)}
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {preview && (
        <DocumentFilePreview
          file={preview}
          onClose={() => setPreviewId(null)}
          navigation={
            photos
              ? {
                  index: previewIndex,
                  total: files.length,
                  onChange: (index) => setPreviewId(files[index]!.id),
                }
              : undefined
          }
        />
      )}
    </>
  )
}
