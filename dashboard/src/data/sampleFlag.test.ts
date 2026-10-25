// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decideSample } from './sampleFlag'

describe('decideSample', () => {
  it('is never on in a production build, whatever the URL or stored choice says', () => {
    expect(decideSample(false, '?sample=1', '1')).toEqual({ on: false, persist: null })
  })
  it('?sample=1 turns it on and remembers; ?sample=0 turns it off and remembers', () => {
    expect(decideSample(true, '?sample=1', null)).toEqual({ on: true, persist: '1' })
    expect(decideSample(true, '?sample=0', '1')).toEqual({ on: false, persist: '0' })
  })
  it('otherwise follows the remembered choice (default off)', () => {
    expect(decideSample(true, '', '1')).toEqual({ on: true, persist: null })
    expect(decideSample(true, '?x=1', null)).toEqual({ on: false, persist: null })
  })
})
