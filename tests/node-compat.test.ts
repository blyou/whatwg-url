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
  'http://0.0.0.0/',
  'http://255.255.255.255/',
  'http://1.2.3/',
  'http://1.2/',
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
  // --- IPv4: decimal / hex / octal and overflow-to-domain ---
  'http://0/',
  'http://1.2.3.4/',
  'http://2130706433/', // 127.0.0.1 written as a single decimal number
  'http://0xffffffff/', // 2^32 - 1, largest valid IPv4
  'http://4294967295/',
  'http://4294967296/', // overflow -> NOT an IPv4 address, becomes a domain
  'http://1111111111111111111111111111111/', // decimal overflow -> domain
  'http://256.0.0.1/', // out-of-range octet -> domain
  'http://1.2.3.4.5/', // too many labels -> domain
  'http://00.0.0.0/', // leading-zero (octal-style) handling
  'http://0177.0.0.1/', // octal
  // --- ports: default stripped, 0 and 65535 valid ( > 65535 is rejected by Node -> skipped ) ---
  'http://example.com:80/',
  'http://example.com:0/',
  'http://example.com:65535/',
  // --- scheme is lowercased ---
  'HTTP://example.com/',
  'HtTpS://example.com/',
  // --- userinfo: empty, encoded '@', colon inside password, userinfo before '@host' ---
  'http://user@example.com/',
  'http://:@example.com/',
  'http://user%40name@example.com/',
  'http://a:b:c@example.com/',
  'http://user:pass:word@example.com/',
  'http://example.com@other.com/',
  // --- file://: empty host, absolute paths, Windows drive, remote host ---
  'file:///',
  'file:///etc/passwd',
  'file://localhost/C:/path',
  'file://host/path',
  // --- paths: double slash, trailing slash, with query (no percent) ---
  'http://example.com//',
  'http://example.com/foo/bar?baz',
  'http://example.com/foo/bar/',
  // --- leading/trailing whitespace and tabs are stripped ---
  'http://example.com/ ',
  // --- query / fragment edge cases ---
  'http://example.com/?#',
  'http://example.com/#',
  'http://example.com/?',
  'http://example.com/?a=b&c=d',
  'http://example.com/?a=b#c=d',
  // --- percent-encoded / IDN host (decoded then re-encoded) ---
  'http://xn--mnchen-3ya.de/',
  'http://xn--fiqs8s.com/',
  'http://%E2%82%AC.com/',
  // --- IPv6: v4-mapped, all-zeros, with port (default stripped) ---
  'http://[::ffff:127.0.0.1]/',
  'http://[0:0:0:0:0:0:0:0]/',
  'http://[::1]:8080/',
  'http://[::1]:80/',
  'http://[1::1]/',
  // --- non-special schemes keep path/query/fragment verbatim ---
  'non-special:?query#frag',
  'non-special:/path',
  'a1://x/',
  'a.b://x/',
  'a+b://x/',
  'a-b://x/',
  // --- special URL with empty host ---
  'http:///path',
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
