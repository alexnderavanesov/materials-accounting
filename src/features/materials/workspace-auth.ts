import { z } from 'zod'

export const loginSchema = z
  .object({
    login: z.string().trim().min(1).max(80),
    password: z.string().min(1).max(256),
  })
  .strict()
export const userInputSchema = z
  .object({
    login: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-zA-Z0-9._@-]+$/),
    name: z.string().trim().min(1).max(100),
    password: z.string().min(4).max(256),
    role: z.enum(['admin', 'editor']),
  })
  .strict()
export type WorkspaceUser = {
  id: string
  login: string
  name: string
  role: 'admin' | 'editor'
}
