import { describe, it, expect } from 'vitest'
// import { URL } from '../../src/index.ts'
import { URL } from '../../dist/index.mjs'
import settersData from '../wpt-resources/setters_tests.json' with { type: 'json' }

interface SetterCase {
  comment?: string
  href: string
  new_value: string
  expected: Record<string, string>
}

type SettersTestFile = Record<string, SetterCase[]>

// Vite infers a precise (non-indexable) literal type from the JSON import, so
// assert it back to a `Record<string, SetterCase[]>` to allow `data[key]` access.
const data: SettersTestFile = settersData as unknown as SettersTestFile

describe('WPT setters_tests.json — URL setter behavior', () => {
  // Skip the "comment" key which holds explanatory text, not test cases.
  const propNames = Object.keys(data).filter(k => k !== 'comment')

  for (const propName of propNames) {
    const cases = data[propName]

    describe(`setter: ${propName}`, () => {
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i]

        it(`[${i}] href=${JSON.stringify(c.href)} new_value=${JSON.stringify(c.new_value)}`, () => {
          const url = new URL(c.href)

          ;(url as any)[propName] = c.new_value

          for (const [key, expected] of Object.entries(c.expected)) {
            expect((url as any)[key], `${key}`).toBe(expected)
          }
        })
      }
    })
  }
})
