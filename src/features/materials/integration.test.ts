import { describe, expect, it } from 'vitest'
import postgres from 'postgres'

const hasTestDatabase = Boolean(process.env.DATABASE_URL_TEST)

describe.skipIf(!hasTestDatabase)('materials postgres integration', () => {
  it('connects to PostgreSQL and sees migrated materials tables', async () => {
    const sql = postgres(process.env.DATABASE_URL_TEST!, { max: 1 })

    try {
      const rows = await sql<Array<{ table_name: string }>>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in ('documents', 'project_material_lines', 'stock_ledger')
        order by table_name
      `

      expect(rows.map((row) => row.table_name)).toEqual([
        'documents',
        'project_material_lines',
        'stock_ledger',
      ])
    } finally {
      await sql.end()
    }
  })
})
