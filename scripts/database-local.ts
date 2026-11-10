import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { createConnection } from 'node:net'
import { loadEnvFile } from 'node:process'
import postgres from 'postgres'

const root = resolve('.materials-workspace/postgres')
const data = resolve(root, 'data')
const envFile = resolve('.env')
const command = process.argv[2] ?? 'start'
function run(binary: string, args: string[]) {
  const result = spawnSync(binary, args, { encoding: 'utf8' })
  if (result.status !== 0)
    throw new Error(
      `${binary}: ${result.stderr || result.stdout || result.error?.message}`,
    )
}
if (command === 'stop') {
  if (!existsSync(resolve(data, 'PG_VERSION')))
    throw new Error('Локальная база этого проекта ещё не создана.')
  run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
  console.log('PostgreSQL этого проекта остановлен.')
} else {
  if (existsSync(envFile)) loadEnvFile(envFile)
  const available = await new Promise<boolean>((done) => {
    const socket = createConnection({ host: '127.0.0.1', port: 55432 })
    socket.once('connect', () => {
      socket.destroy()
      done(false)
    })
    socket.once('error', () => done(true))
  })
  if (!available && !existsSync(resolve(data, 'postmaster.pid')))
    throw new Error(
      'Порт 55432 занят другим сервером. Он не изменён. Настройте DATABASE_URL явно.',
    )
  if (!process.env.DATABASE_URL) {
    const password = randomBytes(24).toString('hex')
    const before = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
    writeFileSync(
      envFile,
      `${before}\nDATABASE_URL=postgres://materials:${password}@127.0.0.1:55432/materials\nDATABASE_URL_TEST=postgres://materials:${password}@127.0.0.1:55432/materials_test\nMATERIALS_STORAGE=postgres\n`,
      { mode: 0o600 },
    )
    chmodSync(envFile, 0o600)
    loadEnvFile(envFile)
  }
  const url = new URL(process.env.DATABASE_URL!)
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '55432' ||
    url.pathname !== '/materials'
  )
    throw new Error(
      'Команда предназначена только для локальной базы materials на 55432. Существующая DATABASE_URL не изменена.',
    )
  mkdirSync(root, { recursive: true, mode: 0o700 })
  if (!existsSync(resolve(data, 'PG_VERSION'))) {
    const passwordFile = resolve(root, 'init-password')
    writeFileSync(passwordFile, decodeURIComponent(url.password), {
      mode: 0o600,
    })
    try {
      run('initdb', [
        '-D',
        data,
        '-U',
        'materials',
        '--auth-local=trust',
        '--auth-host=scram-sha-256',
        `--pwfile=${passwordFile}`,
        '--encoding=UTF8',
        '--locale=C',
      ])
    } finally {
      const { unlinkSync } = await import('node:fs')
      unlinkSync(passwordFile)
    }
    writeFileSync(
      resolve(data, 'postgresql.auto.conf'),
      `listen_addresses = '127.0.0.1'\nport = 55432\nunix_socket_directories = '${root.replaceAll("'", "''")}'\n`,
    )
  }
  if (available)
    run('pg_ctl', [
      '-D',
      data,
      '-l',
      resolve(root, 'postgres.log'),
      '-w',
      'start',
    ])
  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'
  const sql = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} })
  try {
    for (const name of ['materials', 'materials_test']) {
      const rows =
        await sql`select datname from pg_database where datname = ${name}`
      if (!rows.length) await sql`create database ${sql(name)} owner materials`
    }
  } finally {
    await sql.end()
  }
  console.log(
    'PostgreSQL готов: 127.0.0.1:55432, базы materials и materials_test. Данные: .materials-workspace/postgres/data',
  )
}
