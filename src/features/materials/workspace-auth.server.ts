import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { workspaceSql } from '../../db/connection.server'
import { userInputSchema } from './workspace-auth'
import type { WorkspaceUser } from './workspace-auth'

const cookieName = 'materials_session'
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex')
const passwordKey = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  )
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${(await passwordKey(password, salt)).toString('hex')}`
}
export async function verifyPassword(password: string, hash: string) {
  const [salt, hex] = hash.split(':')
  if (!salt || !hex || !/^[a-f0-9]{128}$/.test(hex)) return false
  const key = await passwordKey(password, salt)
  return timingSafeEqual(key, Buffer.from(hex, 'hex'))
}
let dummyHash: Promise<string> | undefined
function sessionToken(request: Request) {
  return request.headers
    .get('cookie')
    ?.split(/;\s*/)
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1)
}
export function applicationOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN
  if (configured) {
    const url = new URL(configured)
    if (
      url.protocol !== 'https:' &&
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    )
      throw new Error(
        'Для общего сервера APP_ORIGIN должен использовать HTTPS.',
      )
    return url.origin
  }
  const url = new URL(request.url)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Настройте APP_ORIGIN с HTTPS для доступа через интернет.')
  return url.origin
}
export function checkWorkspaceOrigin(request: Request) {
  const origin = applicationOrigin(request)
  if (
    !['GET', 'HEAD'].includes(request.method) &&
    request.headers.get('origin') !== origin
  )
    throw new Error('Запрос с другого сайта отклонён.')
}
export function sessionCookie(token: string, request: Request, clear = false) {
  const secure = applicationOrigin(request).startsWith('https:')
  return `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : 28800}${secure ? '; Secure' : ''}`
}
export async function currentWorkspaceUser(
  request: Request,
): Promise<WorkspaceUser | null> {
  checkWorkspaceOrigin(request)
  const token = sessionToken(request)
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  const sql = workspaceSql()
  const [row] = await sql<
    WorkspaceUser[]
  >`select u.id, u.login, u.name, u.role from workspace_sessions s join workspace_users u on u.id = s.user_id where s.token_hash = ${tokenHash(token)} and s.expires_at > now() and u.disabled = 0`
  return row ?? null
}
export async function requireWorkspaceUser(request: Request, admin = false) {
  const user = await currentWorkspaceUser(request)
  if (!user)
    throw new Error(
      'Сеанс завершён. Войдите снова; несохранённые изменения остаются в этой вкладке.',
    )
  if (admin && user.role !== 'admin')
    throw new Error('Для этого действия нужны права администратора.')
  return user
}
export async function loginWorkspace(
  request: Request,
  login: string,
  password: string,
) {
  checkWorkspaceOrigin(request)
  const sql = workspaceSql()
  const normalized = login.toLowerCase()
  await sql`delete from workspace_login_attempts where expires_at < now()`
  for (const key of ['all', `login:${normalized}`]) {
    const [bucket] =
      await sql`insert into workspace_login_attempts (key, attempts, expires_at) values (${key}, 1, now() + interval '5 minutes') on conflict (key) do update set attempts = case when workspace_login_attempts.expires_at < now() then 1 else workspace_login_attempts.attempts + 1 end, expires_at = case when workspace_login_attempts.expires_at < now() then now() + interval '5 minutes' else workspace_login_attempts.expires_at end returning attempts`
    if (Number(bucket!.attempts) > (key === 'all' ? 150 : 15))
      throw new Error('Слишком много попыток входа. Повторите через 5 минут.')
  }
  const [user] = await sql<
    (WorkspaceUser & { password_hash: string; disabled: number })[]
  >`select * from workspace_users where login = ${normalized}`
  dummyHash ??= hashPassword(randomBytes(32).toString('hex'))
  const matches = await verifyPassword(
    password,
    user?.password_hash ?? (await dummyHash),
  )
  if (!user || user.disabled || !matches)
    throw new Error('Неверный логин или пароль.')
  const token = randomBytes(32).toString('hex')
  await sql.begin(async (tx) => {
    const previous = sessionToken(request)
    if (previous)
      await tx`delete from workspace_sessions where token_hash = ${tokenHash(previous)}`
    await tx`delete from workspace_sessions where expires_at < now()`
    await tx`insert into workspace_sessions (token_hash, user_id, expires_at) values (${tokenHash(token)}, ${user.id}, now() + interval '8 hours')`
  })
  return {
    token,
    user: { id: user.id, login: user.login, name: user.name, role: user.role },
  }
}
export async function logoutWorkspace(request: Request) {
  checkWorkspaceOrigin(request)
  const token = sessionToken(request)
  if (token)
    await workspaceSql()`delete from workspace_sessions where token_hash = ${tokenHash(token)}`
}
export async function createWorkspaceUser(input: unknown) {
  const data = userInputSchema.parse(input)
  const hash = await hashPassword(data.password)
  const [user] = await workspaceSql()<
    WorkspaceUser[]
  >`insert into workspace_users (login, name, password_hash, role) values (${data.login.toLowerCase()}, ${data.name}, ${hash}, ${data.role}) returning id, login, name, role`
  return user!
}
export async function authenticatedWorkspaceResponse(
  request: Request,
  handler: (request: Request) => Promise<Response>,
) {
  try {
    await requireWorkspaceUser(request)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Необходим вход.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  return handler(request)
}
