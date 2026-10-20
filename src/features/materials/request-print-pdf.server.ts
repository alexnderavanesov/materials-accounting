import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { PrintError } from './request-print-store.server'

const execFileAsync = promisify(execFile)
export async function findSoffice() {
  if (process.env.MATERIALS_SOFFICE_PATH)
    return process.env.MATERIALS_SOFFICE_PATH
  if (process.platform === 'darwin') {
    const application = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    try {
      await access(application)
      return application
    } catch {
      /* Also allow PATH installations. */
    }
  }
  return 'soffice'
}
export async function convertRequestPdf(
  bytes: Buffer,
  options: { executable?: string; timeout?: number; tempRoot?: string } = {},
) {
  const directory = await mkdtemp(
    join(options.tempRoot ?? tmpdir(), 'materials-print-'),
  )
  try {
    const input = join(directory, 'request.xlsx')
    await writeFile(input, bytes, { mode: 0o600 })
    const profile = join(directory, 'profile')
    // A private profile prevents concurrent conversions from attaching to a user's office process.
    await execFileAsync(
      options.executable ?? (await findSoffice()),
      [
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        '--headless',
        '--nologo',
        '--nodefault',
        '--norestore',
        '--convert-to',
        'pdf:calc_pdf_Export',
        '--outdir',
        directory,
        input,
      ],
      {
        timeout: options.timeout ?? 45000,
        maxBuffer: 1024 * 1024,
        killSignal: 'SIGKILL',
      },
    )
    const pdf = await readFile(join(directory, 'request.pdf'))
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new Error('Invalid PDF')
    return pdf
  } catch (error) {
    const cause = error as NodeJS.ErrnoException & { killed?: boolean }
    if (cause.code === 'ENOENT')
      throw new PrintError(
        'Не удалось получить PDF. Установите LibreOffice или укажите MATERIALS_SOFFICE_PATH к программе soffice.',
        503,
      )
    if (cause.killed)
      throw new PrintError(
        'Формирование PDF заняло слишком много времени. Упростите шаблон и повторите печать.',
        504,
      )
    throw new PrintError(
      'LibreOffice не смог сформировать PDF. Проверьте шаблон и доступность конвертера.',
      500,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
