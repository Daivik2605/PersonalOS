import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Revision 4: no emoji anywhere in the UI, seed or tests. Text symbols such as ✓ ✕ ▲ ▼ ▾ ⚑ are fine; only emoji-presentation characters are refused.
const EMOJI = /\p{Emoji_Presentation}|️|‍/u

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|css|html)$/.test(name) ? [p] : []
  })
}

describe('no emoji', () => {
  it('appears in no source or test file', () => {
    const offenders = files('src').filter((f) => !f.endsWith('noEmoji.test.ts') && EMOJI.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
