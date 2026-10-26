// @vitest-environment node
// backup.sh and GET /backup, with a fake pg_dump so no database is needed.
import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { backupInfo } from './backups.mjs'
import { createLauncherServer } from './http.mjs'

const SCRIPT = join(import.meta.dirname, 'backup.sh')
const URL_SECRET = 'postgresql://postgres:sup3r-secret@db.example.supabase.co:5432/postgres'
const dirs = []
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }) })

/** `mode` picks how the fake pg_dump behaves. */
function fixture({ mode = 'ok', envLine = `SUPABASE_DB_URL=${URL_SECRET}` } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'os-backup-'))
  dirs.push(base)
  const envFile = join(base, '.env.local')
  if (envLine !== null) writeFileSync(envFile, `OTHER=1\n${envLine}\n`)
  const fake = join(base, 'pg_dump')
  writeFileSync(fake, `#!/bin/sh
case "$1" in --version) echo "pg_dump (PostgreSQL) 17.2"; exit 0;; esac
echo "$@" >> "${base}/calls.log"
out=""; prev=""; fallback=""
for a in "$@"; do [ "$prev" = "--file" ] && out="$a"; case "$a" in --schema=*) fallback=1;; esac; prev="$a"; done
case "${mode}" in
  mismatch) echo "pg_dump: error: aborting because of server version mismatch" >&2; echo "pg_dump: detail: server version: 17.6; pg_dump version: 14.20" >&2; exit 1;;
  perm) if [ -z "$fallback" ]; then echo "pg_dump: error: permission denied for schema vault" >&2; exit 1; fi; echo "-- partial dump" > "$out"; exit 0;;
  fail) echo "pg_dump: error: connection to server failed using $PGPW ${URL_SECRET}" >&2; exit 1;;
  empty) : > "$out"; exit 0;;
  *) echo "-- dump of everything" > "$out"; exit 0;;
esac
`)
  chmodSync(fake, 0o755)
  const dir = join(base, 'backups')
  const run = (date = '2026-10-25') => spawnSync('sh', [SCRIPT], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', BACKUP_ENV_FILE: envFile, BACKUP_DIR: dir, PG_DUMP: fake, BACKUP_DATE: date },
  })
  return { base, dir, run, calls: () => (existsSync(join(base, 'calls.log')) ? readFileSync(join(base, 'calls.log'), 'utf8') : '') }
}
const mode = (p) => (statSync(p).mode & 0o777).toString(8)
const text = (r) => r.stdout + r.stderr

describe('backup.sh', () => {
  it('writes a verified, private backup and keeps the folder tidy', () => {
    const f = fixture()
    const r = f.run()
    expect(r.status, text(r)).toBe(0)
    const file = join(f.dir, '2026-10-25.sql.gz')
    expect(gunzipSync(readFileSync(file)).toString()).toContain('dump of everything')
    expect(mode(f.dir)).toBe('700')
    expect(mode(file)).toBe('600')
    expect(readdirSync(f.dir)).toEqual(['2026-10-25.sql.gz']) // no temp files left
    expect(text(r)).not.toContain('sup3r-secret')
  })

  it('keeps the newest 8 and never deletes other files', () => {
    const f = fixture()
    mkdirSync(f.dir, { recursive: true })
    for (let d = 1; d <= 9; d++) writeFileSync(join(f.dir, `2026-10-${String(d).padStart(2, '0')}.sql.gz`), 'x')
    writeFileSync(join(f.dir, 'notes.txt'), 'keep me')
    expect(f.run('2026-10-25').status).toBe(0)
    const names = readdirSync(f.dir).sort()
    expect(names.filter((n) => n.endsWith('.sql.gz'))).toEqual([
      '2026-10-03.sql.gz', '2026-10-04.sql.gz', '2026-10-05.sql.gz', '2026-10-06.sql.gz',
      '2026-10-07.sql.gz', '2026-10-08.sql.gz', '2026-10-09.sql.gz', '2026-10-25.sql.gz',
    ])
    expect(names).toContain('notes.txt')
  })

  it('checks and fixes permissions on every run, even when the dump then fails', () => {
    const f = fixture({ mode: 'fail' })
    mkdirSync(f.dir, { recursive: true })
    const old = join(f.dir, '2026-10-01.sql.gz')
    writeFileSync(old, 'x')
    chmodSync(f.dir, 0o755); chmodSync(old, 0o644)
    const r = f.run()
    expect(r.status).toBe(1)
    expect(mode(f.dir)).toBe('700')
    expect(mode(old)).toBe('600')
    expect(text(r)).toContain('permissions on')
  })

  it('a failed run leaves older backups untouched, no partial file, and hides the connection string', () => {
    const f = fixture({ mode: 'fail' })
    mkdirSync(f.dir, { recursive: true })
    writeFileSync(join(f.dir, '2026-10-01.sql.gz'), 'x')
    const r = f.run()
    expect(r.status).toBe(1)
    expect(readdirSync(f.dir)).toEqual(['2026-10-01.sql.gz'])
    expect(text(r)).not.toContain('sup3r-secret')
    expect(text(r)).toContain('<SUPABASE_DB_URL>')
  })

  it('refuses an empty dump', () => {
    const f = fixture({ mode: 'empty' })
    const r = f.run()
    expect(r.status).toBe(1)
    expect(text(r)).toContain('empty')
    expect(existsSync(join(f.dir, '2026-10-25.sql.gz'))).toBe(false)
  })

  it('falls back to public, auth and storage on permission errors, and says so', () => {
    const f = fixture({ mode: 'perm' })
    const r = f.run()
    expect(r.status, text(r)).toBe(0)
    expect(text(r)).toContain('FALLBACK')
    expect(text(r)).toContain('--schema=public --schema=auth --schema=storage')
    const calls = f.calls().trim().split('\n')
    expect(calls).toHaveLength(2)
    expect(calls[0]).not.toContain('--schema')
    expect(calls[1]).toContain('--schema=public')
    expect(calls[1]).toContain('--schema=auth')
    expect(calls[1]).toContain('--schema=storage')
    expect(gunzipSync(readFileSync(join(f.dir, '2026-10-25.sql.gz'))).toString()).toContain('partial dump')
  })

  it('tells you to brew install the matching version when pg_dump is too old', () => {
    const r = fixture({ mode: 'mismatch' }).run()
    expect(r.status).toBe(1)
    expect(text(r)).toContain('brew install postgresql@17')
  })

  it('explains a missing or empty SUPABASE_DB_URL', () => {
    const noFile = fixture({ envLine: null }).run()
    expect(noFile.status).toBe(1)
    expect(text(noFile)).toContain('SUPABASE_DB_URL')
    const empty = fixture({ envLine: 'SUPABASE_DB_URL=' }).run()
    expect(empty.status).toBe(1)
    expect(text(empty)).toContain('is not set')
  })

  it('accepts a quoted URL', () => {
    const f = fixture({ envLine: `SUPABASE_DB_URL="${URL_SECRET}"` })
    expect(f.run().status).toBe(0)
  })
})

describe('GET /backup', () => {
  function setup(dir) {
    const server = createLauncherServer({}, { backupsDir: dir })
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      const call = (path, headers = {}) => new Promise((res, rej) => {
        http.get({ host: '127.0.0.1', port, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (resp) => {
          let body = ''
          resp.on('data', (c) => (body += c))
          resp.on('end', () => res({ status: resp.statusCode, body: JSON.parse(body) }))
        }).on('error', rej)
      })
      resolve({ call, close: () => new Promise((r) => server.close(() => r())) })
    }))
  }

  it('reports no backups for a missing or empty folder', async () => {
    const base = mkdtempSync(join(tmpdir(), 'os-backup-')); dirs.push(base)
    const s = await setup(join(base, 'nope'))
    expect((await s.call('/backup')).body).toEqual({ latest: null, count: 0 })
    await s.close()
    expect(backupInfo(base)).toEqual({ latest: null, count: 0 })
  })

  it('reports the newest matching file only, with no path', async () => {
    const base = mkdtempSync(join(tmpdir(), 'os-backup-')); dirs.push(base)
    writeFileSync(join(base, '2026-10-11.sql.gz'), 'aa')
    writeFileSync(join(base, '2026-10-18.sql.gz'), 'bbbb')
    writeFileSync(join(base, '2026-10-30.sql'), 'ignored')
    writeFileSync(join(base, '.2026-10-30.sql.gz.tmp'), 'ignored')
    writeFileSync(join(base, 'latest.sql.gz'), 'ignored')
    const s = await setup(base)
    const r = await s.call('/backup')
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ latest: { name: '2026-10-18.sql.gz', date: '2026-10-18', bytes: 4 }, count: 2 })
    expect(JSON.stringify(r.body)).not.toContain(base)
    await s.close()
  })

  it('still applies the Host and Origin guards', async () => {
    const base = mkdtempSync(join(tmpdir(), 'os-backup-')); dirs.push(base)
    const s = await setup(base)
    expect((await s.call('/backup', { origin: 'https://evil.example' })).status).toBe(403)
    expect((await s.call('/backup', { host: 'evil.example:5171' })).status).toBe(403)
    await s.close()
  })
})
