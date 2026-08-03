import { describe, it, expect } from 'vitest'
// import { URL } from '../../src/index.ts'
import { URL } from '../../dist/index.mjs'
import entries from '../wpt-resources/toascii.json' with { type: 'json' }

interface ToASCIIEntry {
  comment?: string
  input: string
  output?: string
  failure?: boolean
}

const data = (entries as (ToASCIIEntry | string)[]).filter(
  (e): e is ToASCIIEntry => typeof e === 'object',
)

const failureCases: ToASCIIEntry[] = []
const cases: ToASCIIEntry[] = []
data.forEach(c => {
  if (c.output == null || c.failure) failureCases.push(c)
  else cases.push(c)
})

describe('WPT toascii.json — failure cases', () => {
  for (let i = 0; i < failureCases.length; i++) {
    const c = failureCases[i]

    it(`[${i}] input=${JSON.stringify(c.input)}`, () => {
      // WPT toascii.json marks a failing case with `"output": null` (or
      // `failure: true`). Both mean the URL must fail to parse.
      expect(() => new URL(`http://${c.input}/`)).toThrow(TypeError)
    })
  }
})

describe('WPT toascii.json — host ToASCII (punycode)', () => {
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]

    it(`[${i}] input=${JSON.stringify(c.input)}`, () => {
      const url = new URL(`http://${c.input}/`)
      expect(url.hostname, 'hostname').toBe(c.output)
    })
  }
})
