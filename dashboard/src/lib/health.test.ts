// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { APPS } from './apps'
import type { HealthRow, NowRow } from './contract'
import { STALE_DAYS, ago, allAppHealth, appHealth, isStale } from './health'

const NOW = new Date('2026-10-25T15:00:00Z')
const hours = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

const row = (app: string, kind: 'daily' | 'now', over: Partial<HealthRow> = {}): HealthRow => ({
  app, view: `${app}_dashboard_${kind}`, exists: true, columns_ok: true, access_ok: true, in_unions: true,
  contract_version: kind === 'now' ? 1 : null, last_updated_at: kind === 'now' ? hours(1) : null, ...over,
})
const pair = (app: string, over: Partial<HealthRow> = {}) => [row(app, 'daily', over), row(app, 'now', over)]
const missing = (app: string) => (['daily', 'now'] as const).map((k) => row(app, k, { exists: false, columns_ok: false, access_ok: false, in_unions: false, contract_version: null, last_updated_at: null }))
const nowRow = (app: string, over: Partial<NowRow> = {}): NowRow => ({
  user_id: 'u', app, contract_version: 1, status_line: 's', needs_attention: 0, attention_label: null, last_activity_at: hours(5), updated_at: hours(1), ...over,
})
const entry = (key: string) => APPS.find((a) => a.dataKey === key)

describe('appHealth', () => {
  it('not published: neither view exists', () => {
    expect(appHealth('money', entry('money'), missing('money'), [], NOW)).toMatchObject({ state: 'not-published', problems: [], stale: false, updatedAt: null })
  })
  it('ok: both views valid and in the unions', () => {
    const h = appHealth('trading', entry('trading'), pair('trading'), [nowRow('trading')], NOW)
    expect(h).toMatchObject({ state: 'ok', contractVersion: 1, name: 'Chart Journal', known: true })
    expect(h.lastActivityAt).toBe(hours(5))
  })
  it('needs-rerun: valid but not yet in the unions', () => {
    expect(appHealth('taskflow', entry('taskflow'), pair('taskflow', { in_unions: false }), [], NOW).state).toBe('needs-rerun')
  })
  it('contract-broken: wrong columns or access, with the reason', () => {
    const cols = appHealth('dsa', entry('dsa'), [row('dsa', 'daily', { columns_ok: false, in_unions: false }), row('dsa', 'now')], [], NOW)
    expect(cols.state).toBe('contract-broken')
    expect(cols.problems.join(' ')).toMatch(/Daily view doesn't match the contract columns/)
    const acc = appHealth('dsa', entry('dsa'), [row('dsa', 'daily'), row('dsa', 'now', { access_ok: false, in_unions: false })], [], NOW)
    expect(acc.problems.join(' ')).toMatch(/Now view is not security_invoker/)
  })
  it('contract-broken: only one of the two views exists', () => {
    const h = appHealth('dsa', entry('dsa'), [row('dsa', 'daily'), { ...row('dsa', 'now'), exists: false, columns_ok: false, access_ok: false, in_unions: false }], [], NOW)
    expect(h.state).toBe('contract-broken')
    expect(h.problems[0]).toMatch(/Only dsa_dashboard_daily exists/)
  })
})

describe('staleness applies to syncing apps only', () => {
  const old = hours(STALE_DAYS * 24 + 1)
  it('DSA is stale after more than 2 days without an update', () => {
    const h = appHealth('dsa', entry('dsa'), pair('dsa', { last_updated_at: old }), [nowRow('dsa', { updated_at: old })], NOW)
    expect(h.stale).toBe(true)
  })
  it('DSA is not stale at exactly 2 days or when fresh', () => {
    expect(isStale(true, hours(STALE_DAYS * 24), NOW)).toBe(false)
    expect(isStale(true, hours(2), NOW)).toBe(false)
  })
  it('non-syncing apps are never stale, however old, but still show last activity as plain information', () => {
    for (const key of ['trading', 'taskflow', 'money']) {
      const h = appHealth(key, entry(key), pair(key, { last_updated_at: old }), [nowRow(key, { updated_at: old, last_activity_at: old })], NOW)
      expect(h.stale, key).toBe(false)
      expect(h.lastActivityAt, key).toBe(old)
    }
  })
  it('an unpublished or unknown-update app is not stale', () => {
    expect(appHealth('dsa', entry('dsa'), missing('dsa'), [], NOW).stale).toBe(false)
    expect(isStale(true, null, NOW)).toBe(false)
  })
})

describe('allAppHealth', () => {
  it('zero apps published: every registry app is "not published yet" (never a fake zero)', () => {
    const all = allAppHealth(APPS.flatMap((a) => missing(a.dataKey)), [], NOW)
    expect(all.map((a) => a.dataKey)).toEqual(['trading', 'dsa', 'taskflow', 'money'])
    expect(all.every((a) => a.state === 'not-published')).toBe(true)
  })
  it('an empty health list (e.g. before the first load) also yields not-published, not a crash', () => {
    expect(allAppHealth([], [], NOW).every((a) => a.state === 'not-published')).toBe(true)
  })
  it('one app published', () => {
    const all = allAppHealth([...pair('trading'), ...missing('dsa'), ...missing('taskflow'), ...missing('money')], [nowRow('trading')], NOW)
    expect(all.map((a) => a.state)).toEqual(['ok', 'not-published', 'not-published', 'not-published'])
  })
  it('all four published and fine', () => {
    const all = allAppHealth(APPS.flatMap((a) => pair(a.dataKey)), APPS.map((a) => nowRow(a.dataKey)), NOW)
    expect(all.every((a) => a.state === 'ok')).toBe(true)
  })
  it('lists an app found by name that is not in the registry, after the known ones', () => {
    const all = allAppHealth([...APPS.flatMap((a) => missing(a.dataKey)), ...pair('demo', { in_unions: false })], [], NOW)
    expect(all.at(-1)).toMatchObject({ dataKey: 'demo', known: false, name: 'demo', state: 'needs-rerun' })
  })
})

describe('ago', () => {
  it.each([
    [null, 'never'], [hours(0), 'just now'], [hours(0.1), '6 min ago'], [hours(3), '3 h ago'], [hours(24), '1 day ago'], [hours(60), '2 days ago'],
  ])('%s -> %s', (from, out) => expect(ago(from, NOW)).toBe(out))
  it('treats a timestamp slightly in the future (clock skew) as just now', () => {
    expect(ago(new Date(NOW.getTime() + 5000), NOW)).toBe('just now')
  })
})
