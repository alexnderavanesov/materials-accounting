import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createWorkspaceUser } from '../src/features/materials/workspace-auth.server'
import { workspaceSql } from '../src/db/connection.server'

const [login, name, role = 'editor'] = process.argv.slice(2)
if (!login || !name)
  throw new Error(
    'Использование: pnpm user:add логин "Имя пользователя" [admin|editor]. Пароль генерируется либо передаётся через MATERIALS_NEW_PASSWORD.',
  )
const password =
  process.env.MATERIALS_NEW_PASSWORD ?? randomBytes(15).toString('base64url')
try {
  const user = await createWorkspaceUser({ login, name, role, password })
  const directory = resolve('.materials-workspace/access')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const file = resolve(directory, `${user.id}.txt`)
  await writeFile(
    file,
    `Пользователь: ${user.name}\nЛогин: ${user.login}\nПароль: ${password}\nРоль: ${user.role}\n`,
    { mode: 0o600 },
  )
  console.log(`Создан пользователь ${user.login}. Данные входа: ${file}`)
} finally {
  await workspaceSql().end()
}
