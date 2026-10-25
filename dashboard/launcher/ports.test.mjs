// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { closeServer, freePort, hasIPv6, listen } from './testkit.mjs'
import { isPortUp } from './ports.mjs'

const open = []
afterEach(async () => { await Promise.all(open.splice(0).map(closeServer)) })

describe('isPortUp', () => {
  it('is false for a free port', async () => {
    expect(await isPortUp(await freePort())).toBe(false)
  })

  it('sees a listener on 127.0.0.1', async () => {
    const port = await freePort()
    open.push(await listen(port, '127.0.0.1'))
    expect(await isPortUp(port)).toBe(true)
  })

  it('sees a listener on ::1 only (what Vite does on macOS), which a 127.0.0.1-only check would miss', async () => {
    if (!(await hasIPv6())) return
    const port = await freePort('::1')
    open.push(await listen(port, '::1'))
    expect(await isPortUp(port)).toBe(true)
    expect(await isPortUp(port, { hosts: ['127.0.0.1'] })).toBe(false) // the bug we are guarding against
  })
})
