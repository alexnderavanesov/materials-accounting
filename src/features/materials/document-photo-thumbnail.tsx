import { useEffect, useRef, useState } from 'react'
import { ImageOff, LoaderCircle } from 'lucide-react'
import { documentFileUrl } from './document-file-preview'
import type { DocumentFile } from './document-registry'

export function DocumentPhotoThumbnail({
  file,
  alt = '',
  className = 'aspect-[4/3]',
}: {
  file: DocumentFile
  alt?: string
  className?: string
}) {
  const container = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    let objectUrl = ''
    setUrl('')
    setFailed(false)
    void (async () => {
      try {
        // API images are fetched as data, just like the full-size preview.
        // The development server does not route Sec-Fetch-Dest: image to APIs.
        const response = await fetch(`${documentFileUrl(file.id)}&preview=1`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Не удалось загрузить фотографию.')
        const blob = await response.blob()
        if (controller.signal.aborted) return
        if (!['image/png', 'image/jpeg'].includes(blob.type))
          throw new Error('Ответ не содержит изображение.')
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      }
    })()
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file.id, visible])
  return (
    <span
      ref={container}
      className={`relative block overflow-hidden bg-stone-100 ${className}`}
    >
      {failed ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2 text-center text-xs text-stone-500">
          <ImageOff size={20} /> Не удалось загрузить миниатюру
        </span>
      ) : url ? (
        <img
          src={url}
          alt={alt}
          decoding="async"
          className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="absolute inset-0 flex items-center justify-center text-stone-400"
          aria-label="Загрузка миниатюры"
        >
          <LoaderCircle size={20} className="animate-spin" />
        </span>
      )}
    </span>
  )
}
