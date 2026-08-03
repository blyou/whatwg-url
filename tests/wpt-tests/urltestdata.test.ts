import { describe, it, expect } from 'vitest'
// import { URL } from '../../src/index.ts'
import { URL } from '../../dist/index.mjs'
import entries from '../wpt-resources/urltestdata.json' with { type: 'json' }

interface URLTestEntry {
  input: string
  base: string | null
  failure?: true
  href?: string
  origin?: string
  protocol?: string
  username?: string
  password?: string
  host?: string
  hostname?: string
  port?: string
  pathname?: string
  search?: string
  hash?: string
}

const data = (entries as (URLTestEntry | string)[]).filter(
  (e): e is URLTestEntry => typeof e === 'object',
)

const failureCases: URLTestEntry[] = []
const cases: URLTestEntry[] = []
data.forEach(c => {
  if (c.failure) failureCases.push(c)
  else cases.push(c)
})

describe('WPT urltestdata.json — failure cases', () => {
  for (let i = 0; i < failureCases.length; i++) {
    const c = failureCases[i]

    it(`[${i}] input=${JSON.stringify(c.input)} base=${JSON.stringify(c.base)}`, () => {
      expect(() => new URL(c.input, c.base ?? undefined)).toThrow(TypeError)
    })
  }
})

describe('WPT urltestdata.json — URL parsing & serialization', () => {
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]

    it(`[${i}] input=${JSON.stringify(c.input)} base=${JSON.stringify(c.base)}`, () => {
      const url = new URL(c.input, c.base ?? undefined)

      expect(url.href, 'href').toBe(c.href)
      expect(url.protocol, 'protocol').toBe(c.protocol)
      expect(url.username, 'username').toBe(c.username)
      expect(url.password, 'password').toBe(c.password)
      expect(url.host, 'host').toBe(c.host)
      expect(url.hostname, 'hostname').toBe(c.hostname)
      expect(url.port, 'port').toBe(c.port)
      expect(url.pathname, 'pathname').toBe(c.pathname)
      expect(url.search, 'search').toBe(c.search)
      expect(url.hash, 'hash').toBe(c.hash)
      if (!c.origin) return
      expect(url.origin, 'origin').toBe(c.origin)
    })
  }
})
