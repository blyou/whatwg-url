import { describe, it, expect } from 'vitest'
import { URL as NodeURL } from 'node:url'
import { URL as MyURL } from '../src/index'

// Cross-check against Node's built-in URL (which implements the WHATWG URL
// Standard) to guard against regressions in spec compliance.
const parseCases = [
  'http://example.com/',
  'https://example.com:8080/path?x=1#frag',
  'http://user:pass@example.com/',
  'http://üni.code/',
  'http://münchen.de/',
  'http://例子.测试/',
  'http://☃.net/',
  'http://127.0.0.1/',
  'http://0x7f.0.0.1/',
  'http://0x7f000001/',
  'http://999999999/',
  'https://[::1]/',
  'https://[2001:db8::1]/',
  'https://[2001:db8:85a3:8d3:1319:8a2e:370:7348]/',
  'ftp://example.com/',
  'ws://example.com/',
  'wss://example.com:80/',
  'file://localhost/',
  'file://localhost/x',
  'file:///C:/foo/bar',
  'http://example.com./',
  'http://%E7%A1%82.com/',
  'http://example.com/a/b/../c',
  'http://example.com/a/./b',
  'foo://opaque%20host/',
  'sc://opaque',
  'data:text/plain,hello',
  'data:text/plain;base64,SGVsbG8=',
  'mailto:user@example.com',
  'http://example.com/?a=b%20~',
  'https://example.com:8080/',
  'http://example.com\\path',
  'http://example.com/?a=b c',
]

describe('spec compliance vs node:url', () => {
  for (const c of parseCases) {
    it(`parses ${c}`, () => {
      let node: NodeURL
      try {
        node = new NodeURL(c)
      } catch {
        return // Node rejects this input; we skip rather than assert either way
      }
      let mine: MyURL
      try {
        mine = new MyURL(c)
      } catch (e) {
        throw new Error(`MY IMPL THREW for ${c}: ${(e as Error).message} (node: ${node.href})`)
      }
      expect(mine.href).toBe(node.href)
    })
  }

  const resolveCases: Array<[string, string]> = [
    ['../x', 'http://example.com/a/b/'],
    ['//other.com/p', 'http://example.com/a/'],
    ['?q=2', 'http://example.com/a/?q=1'],
    ['#frag', 'http://example.com/a/'],
    ['/abs', 'http://example.com/a/b/'],
    ['sub', 'http://example.com/a/b/'],
  ]
  for (const [ref, base] of resolveCases) {
    it(`resolves ${ref} against ${base}`, () => {
      let node: NodeURL
      try {
        node = new NodeURL(ref, base)
      } catch {
        return
      }
      let mine: MyURL
      try {
        mine = new MyURL(ref, base)
      } catch (e) {
        throw new Error(
          `MY IMPL THREW for ${ref} <${base}>: ${(e as Error).message} (node: ${node.href})`,
        )
      }
      expect(mine.href).toBe(node.href)
    })
  }
})
