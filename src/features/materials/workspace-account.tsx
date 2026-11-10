import { useState } from 'react'
import {
  addWorkspaceUser,
  listWorkspaceUsers,
  loginToWorkspace,
  logoutFromWorkspace,
  updateWorkspaceUser,
} from './workspace-auth.functions'
import type { WorkspaceUser } from './workspace-auth'

const inputClass = 'rounded border border-stone-300 bg-white px-3 py-2 text-sm'
const buttonClass =
  'rounded border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-100 disabled:opacity-50'
export function WorkspaceLogin({
  userLogin,
  onSignedIn,
}: { userLogin?: string; onSignedIn?: () => void } = {}) {
  const [login, setLogin] = useState(userLogin ?? ''),
    [password, setPassword] = useState('')
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-50 p-6">
      <form
        className="grid w-full max-w-sm gap-4 rounded-xl border bg-white p-8"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          try {
            await loginToWorkspace({ data: { login, password } })
            if (onSignedIn) onSignedIn()
            else window.location.reload()
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : 'Не удалось войти.',
            )
            setBusy(false)
          }
        }}
      >
        <h1 className="text-xl font-semibold">Учёт материалов</h1>
        <label className="grid gap-1 text-sm">
          Логин
          <input
            className={inputClass}
            autoComplete="username"
            readOnly={!!userLogin}
            required
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Пароль
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button className={buttonClass} disabled={busy}>
          {busy ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </main>
  )
}

export function WorkspaceAccount({
  user,
  prepare,
}: {
  user: WorkspaceUser
  prepare: () => Promise<string>
}) {
  const [users, setUsers] = useState<Array<
    WorkspaceUser & { disabled: number }
  > | null>(null)
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [login, setLogin] = useState(''),
    [name, setName] = useState(''),
    [password, setPassword] = useState('')
  const [role, setRole] = useState<'editor' | 'admin'>('editor')
  const [resetId, setResetId] = useState<string | null>(null),
    [resetPassword, setResetPassword] = useState('')
  async function act(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Не удалось выполнить действие.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="flex shrink-0 items-center justify-end gap-3 border-b bg-white px-4 py-1 text-xs">
        <span>{user.name}</span>
        {user.role === 'admin' && (
          <button
            className="underline"
            onClick={() =>
              void act(async () => setUsers(await listWorkspaceUsers()))
            }
          >
            Пользователи
          </button>
        )}
        <button
          className="underline"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await prepare()
              await logoutFromWorkspace()
              window.location.reload()
            })
          }
        >
          Выйти
        </button>
        {error && !users && (
          <span role="alert" className="text-red-700">
            {error}
          </span>
        )}
      </div>
      {users && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Пользователи"
        >
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6">
            <div className="mb-4 flex justify-between">
              <h2 className="text-lg font-semibold">Пользователи</h2>
              <button
                aria-label="Закрыть пользователей"
                onClick={() => setUsers(null)}
              >
                Закрыть
              </button>
            </div>
            <div className="divide-y">
              {users.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 py-3 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    {item.name} · {item.login} ·{' '}
                    {item.role === 'admin' ? 'Администратор' : 'Редактор'}
                    {item.disabled ? ' · Отключён' : ''}
                  </span>
                  <button
                    className="underline"
                    onClick={() => {
                      setResetId(item.id)
                      setResetPassword('')
                    }}
                  >
                    Новый пароль
                  </button>
                  {item.id !== user.id && (
                    <button
                      className="underline"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await updateWorkspaceUser({
                            data: { id: item.id, disabled: !item.disabled },
                          })
                          setUsers(await listWorkspaceUsers())
                        })
                      }
                    >
                      {item.disabled ? 'Включить' : 'Отключить'}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {resetId && (
              <form
                className="my-4 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void act(async () => {
                    await updateWorkspaceUser({
                      data: { id: resetId, password: resetPassword },
                    })
                    setResetId(null)
                    setResetPassword('')
                    if (resetId === user.id) window.location.reload()
                  })
                }}
              >
                <input
                  aria-label="Новый пароль"
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  minLength={4}
                  required
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                />
                <button className={buttonClass} disabled={busy}>
                  Изменить пароль
                </button>
              </form>
            )}
            <form
              className="mt-5 grid gap-3 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault()
                void act(async () => {
                  const result = await addWorkspaceUser({
                    data: { login, name, password, role },
                  })
                  if (!result.ok) throw new Error(result.error)
                  setUsers(await listWorkspaceUsers())
                  setLogin('')
                  setName('')
                  setPassword('')
                })
              }}
            >
              <h3 className="font-medium">Добавить пользователя</h3>
              <label className="grid gap-1 text-sm">
                Имя
                <input
                  className={inputClass}
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Логин
                <input
                  className={inputClass}
                  autoComplete="off"
                  pattern="[a-zA-Z0-9._@-]+"
                  minLength={2}
                  required
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Пароль, от 4 символов
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  minLength={4}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Роль
                <select
                  className={inputClass}
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as 'admin' | 'editor')
                  }
                >
                  <option value="editor">Редактор</option>
                  <option value="admin">Администратор</option>
                </select>
              </label>
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <button className={buttonClass} disabled={busy}>
                Создать пользователя
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
