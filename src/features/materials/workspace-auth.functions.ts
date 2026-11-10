import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { loginSchema, userInputSchema } from './workspace-auth'
import {
  createWorkspaceUser,
  hashPassword,
  loginWorkspace,
  logoutWorkspace,
  requireWorkspaceUser,
  sessionCookie,
} from './workspace-auth.server'
import { workspaceSql } from '../../db/connection.server'
import type { WorkspaceUser } from './workspace-auth'

export const loginToWorkspace = createServerFn({ method: 'POST' })
  .validator(loginSchema)
  .handler(async ({ data }) => {
    const request = getRequest()
    const result = await loginWorkspace(request, data.login, data.password)
    setResponseHeader('Set-Cookie', sessionCookie(result.token, request))
    setResponseHeader('Cache-Control', 'no-store')
    return result.user
  })
export const logoutFromWorkspace = createServerFn({ method: 'POST' }).handler(
  async () => {
    const request = getRequest()
    await logoutWorkspace(request)
    setResponseHeader('Set-Cookie', sessionCookie('', request, true))
    return { ok: true }
  },
)
export const listWorkspaceUsers = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireWorkspaceUser(getRequest(), true)
    setResponseHeader('Cache-Control', 'no-store')
    return workspaceSql()<
      (WorkspaceUser & { disabled: number })[]
    >`select id, login, name, role, disabled from workspace_users order by name`
  },
)
export const addWorkspaceUser = createServerFn({ method: 'POST' })
  .validator(userInputSchema)
  .handler(async ({ data }) => {
    await requireWorkspaceUser(getRequest(), true)
    try {
      return { ok: true as const, user: await createWorkspaceUser(data) }
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        return { ok: false as const, error: 'Этот логин уже занят.' }
      throw error
    }
  })
export const updateWorkspaceUser = createServerFn({ method: 'POST' })
  .validator(
    z
      .object({
        id: z.uuid(),
        disabled: z.boolean().optional(),
        password: z.string().min(4).max(256).optional(),
      })
      .strict(),
  )
  .handler(async ({ data }) => {
    const actor = await requireWorkspaceUser(getRequest(), true)
    if (actor.id === data.id && data.disabled)
      throw new Error('Нельзя отключить собственную учётную запись.')
    const password = data.password ? await hashPassword(data.password) : null
    await workspaceSql().begin(async (sql) => {
      const [user] =
        await sql`select id from workspace_users where id = ${data.id} for update`
      if (!user) throw new Error('Пользователь не найден.')
      if (data.disabled !== undefined)
        await sql`update workspace_users set disabled = ${data.disabled ? 1 : 0} where id = ${data.id}`
      if (password)
        await sql`update workspace_users set password_hash = ${password} where id = ${data.id}`
      await sql`delete from workspace_sessions where user_id = ${data.id}`
    })
    return { ok: true }
  })
