import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { workspaceSnapshotSchema } from './workspace-snapshot'
import { validateQualityWorkspace } from './quality-workflow'
import type {
  LoadedWorkspace,
  SaveWorkspaceResult,
  WorkspaceSnapshot,
} from './workspace-snapshot'

const queues = new Map<string, Promise<unknown>>()
const revisionOf = (workspace: WorkspaceSnapshot) =>
  createHash('sha256').update(JSON.stringify(workspace)).digest('hex')

export function createWorkspaceStore(directory: string) {
  const file = join(resolve(directory), 'workspace.json')
  async function load(): Promise<LoadedWorkspace> {
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return { workspace: null, revision: null }
      }
      throw new Error(
        'Не удалось прочитать сохранённые материалы. Файл не изменён.',
        { cause: error },
      )
    }
    try {
      const workspace = workspaceSnapshotSchema.parse(JSON.parse(raw))
      return { workspace, revision: revisionOf(workspace) }
    } catch (error) {
      throw new Error(
        'Файл материалов повреждён или имеет неподдерживаемый формат. Файл не изменён.',
        { cause: error },
      )
    }
  }
  function save(
    workspace: WorkspaceSnapshot,
    expectedRevision: string | null,
  ): Promise<SaveWorkspaceResult> {
    const parsed = workspaceSnapshotSchema.parse(workspace)
    const nextRevision = revisionOf(parsed)
    const operation = (queues.get(file) ?? Promise.resolve()).then(
      async (): Promise<SaveWorkspaceResult> => {
        const current = await load()
        // Repeated request after a lost response is safe and requires no write.
        if (current.revision === nextRevision)
          return { status: 'saved', revision: nextRevision }
        if (current.revision !== expectedRevision) return { status: 'conflict' }
        validateQualityWorkspace(parsed, current.workspace)
        await mkdir(directory, { recursive: true, mode: 0o700 })
        const temporary = `${file}.${randomUUID()}.tmp`
        try {
          await writeFile(temporary, JSON.stringify(parsed, null, 2), {
            encoding: 'utf8',
            flag: 'wx',
            mode: 0o600,
          })
          await rename(temporary, file)
        } finally {
          await rm(temporary, { force: true })
        }
        return { status: 'saved', revision: nextRevision }
      },
    )
    const settled = operation.catch(() => {})
    queues.set(file, settled)
    void settled.then(() => {
      if (queues.get(file) === settled) queues.delete(file)
    })
    return operation
  }
  return { load, save }
}

// process.cwd() stays the project root in both Vite dev and built preview.
export const projectWorkspaceStore = createWorkspaceStore(
  process.env.MATERIALS_WORKSPACE_DIR ??
    resolve(process.cwd(), '.materials-workspace'),
)
