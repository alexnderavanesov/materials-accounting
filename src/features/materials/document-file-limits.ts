export const maxDocumentFileBytes = 20 * 1024 * 1024
export const maxDocumentUploadBytes = 100 * 1024 * 1024
export const maxDocumentUploadFiles = 50

export function documentFileSelectionError(
  files: { name: string; size: number }[],
) {
  if (files.length > maxDocumentUploadFiles)
    return `За один раз можно загрузить до ${maxDocumentUploadFiles} файлов.`
  for (const file of files) {
    if (!/\.(pdf|png|jpe?g|xlsx|docx)$/i.test(file.name))
      return `${file.name}: выберите PDF, PNG, JPEG, XLSX или DOCX.`
    if (!file.size) return `${file.name}: файл пуст.`
    if (file.size > maxDocumentFileBytes)
      return `${file.name}: максимальный размер файла — 20 МБ.`
  }
  if (
    files.reduce((total, file) => total + file.size, 0) > maxDocumentUploadBytes
  )
    return 'Общий размер выбранных файлов превышает 100 МБ.'
  return ''
}
