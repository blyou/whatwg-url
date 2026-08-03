import { describe, it, expect } from 'vitest'
import { percentEncode } from '../../src'
import entries from '../wpt-resources/percent-encoding.json' with { type: 'json' }

interface PercentEncodingEntry {
  input: string
  output: Record<string, string> // keys are encoding names (utf-8, big5, etc.), values are expected percent-encoded strings
}

const cases = (entries as (PercentEncodingEntry | string)[]).filter(
  (e): e is PercentEncodingEntry => typeof e === 'object',
)

describe('WPT percent-encoding.json — percent encoding (UTF-8 only)', () => {
  // This project is a DOM-less ES2023 implementation and only performs UTF-8
  // percent-encoding. WPT's "utf-8" column corresponds exactly to the path
  // percent-encode set, so we assert `percentEncode(input)` directly against
  // it (the raw encoder is exported from src/percent.ts for this purpose).
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    const expected = c.output['utf-8']
    if (expected === undefined) continue

    it(`[${i}] input=${JSON.stringify(c.input)}`, () => {
      const encoded = percentEncode(c.input)
      expect(encoded, 'percent encoded').toBe(expected)
    })
  }
})
