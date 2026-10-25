// Sample-data mode switch (SPEC §1). Pure, and deliberately free of fixture imports so it is safe in a production build,
// where it always answers "off".

export const SAMPLE_KEY = 'os-sample'

export interface SampleDecision { on: boolean; persist: '1' | '0' | null }

/** `?sample=1` turns it on (and remembers), `?sample=0` turns it off; otherwise the remembered choice. Never on outside dev. */
export function decideSample(dev: boolean, search: string, stored: string | null): SampleDecision {
  if (!dev) return { on: false, persist: null }
  const q = new URLSearchParams(search).get('sample')
  if (q === '1') return { on: true, persist: '1' }
  if (q === '0') return { on: false, persist: '0' }
  return { on: stored === '1', persist: null }
}

export function readStoredSample(): string | null {
  try { return localStorage.getItem(SAMPLE_KEY) } catch { return null }
}
export function storeSample(v: '1' | '0'): void {
  try { localStorage.setItem(SAMPLE_KEY, v) } catch { /* private mode: the choice just won't persist */ }
}
