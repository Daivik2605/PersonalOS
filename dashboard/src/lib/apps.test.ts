// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APPS, appByDataKey, appByLauncherKey, appUrl, timerLink } from './apps'

interface LauncherApp { key: string; folder: string; command: string[]; port: number; url: string }
const launcher: LauncherApp[] = JSON.parse(readFileSync('launcher/apps.json', 'utf8'))

describe('app registry', () => {
  it('has a registry entry for every launcher/apps.json entry, with the same port and url', () => {
    for (const l of launcher) {
      const a = appByLauncherKey(l.key)
      expect(a, `registry entry for launcher key ${l.key}`).toBeDefined()
      expect(a!.port).toBe(l.port)
      expect(a!.url).toBe(l.url)
    }
  })

  it('only points at launcher keys that exist (null is allowed until the app exists)', () => {
    const keys = new Set(launcher.map((l) => l.key))
    for (const a of APPS) if (a.launcherKey !== null) expect(keys.has(a.launcherKey), a.name).toBe(true)
  })

  it('maps chart-journal to the trading data key and keeps keys unique', () => {
    expect(appByLauncherKey('chart-journal')?.dataKey).toBe('trading')
    expect(new Set(APPS.map((a) => a.dataKey)).size).toBe(APPS.length)
    expect(new Set(APPS.map((a) => a.port)).size).toBe(APPS.length)
    expect(appByDataKey('money')?.launcherKey).toBeNull()
  })

  it('marks only DSA as syncing', () => {
    expect(APPS.filter((a) => a.syncs).map((a) => a.dataKey)).toEqual(['dsa'])
  })

  it('never carries a folder or a start command into the UI', () => {
    for (const a of APPS) expect(Object.keys(a)).not.toEqual(expect.arrayContaining(['folder']))
    for (const a of APPS) expect(Object.keys(a)).not.toEqual(expect.arrayContaining(['command']))
    const bundled = JSON.stringify(APPS)
    for (const l of launcher) {
      for (const part of l.command) expect(bundled).not.toContain(`"${part}"`)
      expect(bundled).not.toContain(l.command.join(' '))
    }
  })

  it('builds TaskFlow deep links', () => {
    const tf = appByDataKey('taskflow')!
    expect(tf.links.map((l) => l.path)).toEqual(['/timer', '/tasks?view=today', '/insights', '/work', '/capture', '/review', '/goals'])
    expect(timerLink('Study/DSA')).toBe('/timer?tag=Study%2FDSA')
    expect(appUrl(tf, timerLink('Study/DSA'))).toBe('http://localhost:5175/timer?tag=Study%2FDSA')
    expect(appUrl(tf)).toBe('http://localhost:5175')
  })
})
