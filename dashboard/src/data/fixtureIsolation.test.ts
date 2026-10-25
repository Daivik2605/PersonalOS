// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Sample data must never reach a production build (SPEC §1): only data/sample.ts imports the fixtures, and only
// data/loadSample.ts imports data/sample.ts, via a dynamic import behind `import.meta.env.DEV`.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}
const src = files('src').filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx') && !f.startsWith(join('src', 'fixtures')) && !f.startsWith(join('src', 'testing')))

describe('sample data isolation', () => {
  it('only data/sample.ts imports the fixtures', () => {
    const importers = src.filter((f) => /from\s+['"][^'"]*\/fixtures['"]/.test(readFileSync(f, 'utf8')))
    expect(importers).toEqual([join('src', 'data', 'sample.ts')])
  })
  it('data/sample.ts is only reached by a dynamic import guarded by import.meta.env.DEV', () => {
    const importers = src.filter((f) => /['"]\.\/sample['"]|data\/sample['"]/.test(readFileSync(f, 'utf8')))
    expect(importers).toEqual([join('src', 'data', 'loadSample.ts')])
    const text = readFileSync(join('src', 'data', 'loadSample.ts'), 'utf8')
    expect(text).toMatch(/if \(!import\.meta\.env\.DEV\) return null/)
    expect(text).toMatch(/await import\('\.\/sample'\)/)
    expect(text).not.toMatch(/^import .*sample/m)
  })
})
