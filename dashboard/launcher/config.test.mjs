// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { loadApps, parseApps } from './config.mjs'

const ok = { key: 'a', name: 'A', folder: 'a', command: ['npm', 'run', 'dev'], port: 5180 }

describe('apps.json', () => {
  it('the real file is valid and lists the three apps on their registry ports', () => {
    const apps = loadApps(new URL('./apps.json', import.meta.url))
    expect(apps.map((a) => [a.key, a.port])).toEqual([['chart-journal', 5173], ['dsa', 5174], ['taskflow', 5175]])
  })

  it('accepts a valid entry', () => {
    expect(parseApps([ok])[0].url).toBe('http://localhost:5180')
  })

  it.each([
    ['a command string (would need a shell)', { ...ok, command: 'npm run dev' }],
    ['an empty command', { ...ok, command: [] }],
    ['a folder outside PersonalOS', { ...ok, folder: '../x' }],
    ['an absolute folder', { ...ok, folder: '/etc' }],
    ['a key that could escape a path', { ...ok, key: '../x' }],
    ['a privileged port', { ...ok, port: 80 }],
  ])('rejects %s', (_name, bad) => {
    expect(() => parseApps([bad])).toThrow()
  })

  it('rejects duplicate keys and ports', () => {
    expect(() => parseApps([ok, { ...ok, port: 5181 }])).toThrow(/duplicate key/)
    expect(() => parseApps([ok, { ...ok, key: 'b' }])).toThrow(/duplicate port/)
  })
})
