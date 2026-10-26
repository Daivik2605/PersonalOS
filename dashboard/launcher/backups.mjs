// Read-only view of the backups folder for GET /backup (SPEC §5). It never runs a backup and never reports a path.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Only files that backup.sh itself writes: YYYY-MM-DD.sql.gz. Anything else in the folder is ignored. */
export const BACKUP_NAME = /^(\d{4})-(\d{2})-(\d{2})\.sql\.gz$/

/** @returns {{ latest: { name: string, date: string, bytes: number } | null, count: number }} */
export function backupInfo(dir) {
  let names
  try { names = readdirSync(dir) } catch { return { latest: null, count: 0 } }
  const files = names.filter((n) => BACKUP_NAME.test(n)).sort()
  const name = files.at(-1)
  if (!name) return { latest: null, count: 0 }
  let bytes = 0
  try { bytes = statSync(join(dir, name)).size } catch { /* removed while reading */ }
  return { latest: { name, date: name.slice(0, 10), bytes }, count: files.length }
}
