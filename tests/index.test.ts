import { describe, it, expect } from 'vitest'
import { URL, URLSearchParams } from '../src/index'

describe('URL parsing & serialization', () => {
  it('parses a basic special URL', () => {
    const u = new URL('https://example.com/')
    expect(u.href).toBe('https://example.com/')
    expect(u.protocol).toBe('https:')
    expect(u.hostname).toBe('example.com')
    expect(u.host).toBe('example.com')
    expect(u.pathname).toBe('/')
    expect(u.origin).toBe('https://example.com')
  })

  it('keeps the default port stripped but keeps non-default ports', () => {
    expect(new URL('https://example.com:443/').href).toBe('https://example.com/')
    expect(new URL('https://example.com:443/').host).toBe('example.com')
    const u = new URL('https://example.com:8080/')
    expect(u.port).toBe('8080')
    expect(u.host).toBe('example.com:8080')
    expect(u.href).toBe('https://example.com:8080/')
  })

  it('throws on invalid URLs', () => {
    expect(() => new URL('http://')).toThrow(TypeError)
    expect(() => new URL('not a url')).toThrow(TypeError)
    expect(() => new URL('http://example.com:99999/')).toThrow(TypeError)
  })

  it('URL.parse / URL.canParse return null / false instead of throwing', () => {
    expect(URL.parse('http://example.com/')).not.toBeNull()
    expect(URL.parse('http://')).toBeNull()
    expect(URL.parse('http://', 'http://example.com/')).not.toBeNull()
    expect(URL.canParse('http://example.com/')).toBe(true)
    expect(URL.canParse('http://')).toBe(false)
    expect(URL.canParse('../x', 'http://example.com/')).toBe(true)
  })
})

describe('special character encoding', () => {
  it('encodes spaces and unsafe chars in the query', () => {
    const u = new URL('https://example.com/?a=b ~')
    expect(u.search).toBe('?a=b%20~')
    expect(u.href).toBe('https://example.com/?a=b%20~')
  })

  it('re-serializes form-encoding on searchParams mutation (space -> +, ~ -> %7E)', () => {
    const u = new URL('https://example.com/?a=b ~')
    u.searchParams.sort()
    expect(u.href).toBe('https://example.com/?a=b+%7E')
  })

  it('percent-decodes the query into searchParams', () => {
    const u = new URL('https://example.com/?a=b%20%7E')
    expect(u.searchParams.get('a')).toBe('b ~')
  })

  it('encodes spaces in the fragment', () => {
    const u = new URL('http://example.com/#frag ment')
    expect(u.hash).toBe('#frag%20ment')
    expect(u.href).toBe('http://example.com/#frag%20ment')
  })

  it('decodes percent-encoded path segments', () => {
    const u = new URL('http://example.com/%E4%B8%AD')
    expect(u.pathname).toBe('/%E4%B8%AD')
    expect(u.href).toBe('http://example.com/%E4%B8%AD')
  })

  it('encodes unsafe chars in pathname when set', () => {
    const u = new URL('http://example.com/')
    u.pathname = '/a b"c'
    expect(u.pathname).toBe('/a%20b%22c')
  })
})

describe('relative path resolution', () => {
  it('resolves a relative reference against a directory base', () => {
    expect(new URL('bar', 'http://example.com/foo/').href).toBe('http://example.com/foo/bar')
  })

  it('resolves ".." references', () => {
    expect(new URL('../baz', 'http://example.com/foo/bar/').href).toBe('http://example.com/foo/baz')
  })

  it('resolves an absolute path reference', () => {
    expect(new URL('/root', 'http://example.com/a/b/').href).toBe('http://example.com/root')
  })

  it('resolves fragment-only and query-only references', () => {
    expect(new URL('#frag', 'http://example.com/').href).toBe('http://example.com/#frag')
    expect(new URL('?q=1', 'http://example.com/').href).toBe('http://example.com/?q=1')
  })

  it('accepts a URL object as the base', () => {
    expect(new URL('x', new URL('http://example.org/')).href).toBe('http://example.org/x')
  })

  it('resolves a relative reference for a non-special scheme when base is file', () => {
    expect(new URL('bar', 'file:///foo/').href).toBe('file:///foo/bar')
  })
})

describe('port & protocol handling', () => {
  it('updates the scheme via the protocol setter', () => {
    const u = new URL('http://example.com/')
    u.protocol = 'https:'
    expect(u.href).toBe('https://example.com/')
  })

  it('ignores a non-special scheme when current scheme is special', () => {
    const u = new URL('http://example.com/')
    u.protocol = 'mailto:'
    expect(u.href).toBe('http://example.com/')
  })

  it('sets a non-default port via the port setter', () => {
    const u = new URL('https://example.com/')
    u.port = '8080'
    expect(u.port).toBe('8080')
    expect(u.host).toBe('example.com:8080')
  })

  it('clears the port when set to empty', () => {
    const u = new URL('https://example.com:8080/')
    u.port = ''
    expect(u.port).toBe('')
    expect(u.host).toBe('example.com')
  })

  it('ignores out-of-range ports (per spec, no throw)', () => {
    const u = new URL('http://example.com/')
    u.port = '70000'
    expect(u.port).toBe('')
    expect(u.host).toBe('example.com')
  })

  it('does not allow user/password/port on file URLs', () => {
    const u = new URL('file:///x')
    u.username = 'a'
    u.password = 'b'
    u.port = '1234'
    expect(u.username).toBe('')
    expect(u.password).toBe('')
    expect(u.port).toBe('')
  })

  it('parses userinfo', () => {
    const u = new URL('http://user:pass@example.com/')
    expect(u.username).toBe('user')
    expect(u.password).toBe('pass')
    expect(u.host).toBe('example.com')
    expect(u.href).toBe('http://user:pass@example.com/')
  })
})

describe('host parsing', () => {
  it('normalizes file://localhost to file:///', () => {
    expect(new URL('file://localhost/').href).toBe('file:///')
    expect(new URL('file://localhost/x').href).toBe('file:///x')
  })

  it('serializes IPv6 hosts with brackets and compression', () => {
    const u = new URL('https://[::1]/')
    expect(u.hostname).toBe('[::1]')
    expect(u.href).toBe('https://[::1]/')
    const v = new URL('https://[2001:db8::1]/')
    expect(v.hostname).toBe('[2001:db8::1]')
  })

  it('parses IPv4 dotted-decimal and hex forms', () => {
    expect(new URL('http://127.0.0.1/').hostname).toBe('127.0.0.1')
    expect(new URL('http://0x7f.0.0.1/').hostname).toBe('127.0.0.1')
  })

  it('percent-encodes opaque hosts', () => {
    const u = new URL('foo://opaque%20host/')
    expect(u.hostname).toBe('opaque%20host')
    expect(u.href).toBe('foo://opaque%20host/')
    // a space inside an opaque host is a forbidden host code point -> invalid
    expect(() => new URL('foo://opaque host/')).toThrow(TypeError)
  })

  it('applies IDNA / punycode for non-ASCII domains', () => {
    const u = new URL('http://üni.code/')
    expect(u.hostname.startsWith('xn--')).toBe(true)
    // the encoded form must be stable (re-parsing yields the same hostname)
    expect(new URL(`http://${u.hostname}/`).hostname).toBe(u.hostname)
  })
})

describe('origin', () => {
  it('returns "null" for opaque origins', () => {
    expect(new URL('data:text/plain,hi').origin).toBe('null')
    expect(new URL('foo://opaque/').origin).toBe('null')
    expect(new URL('mailto:a@b.com').origin).toBe('null')
  })

  it('serializes special origins', () => {
    expect(new URL('https://example.com:8080/').origin).toBe('https://example.com:8080')
    expect(new URL('file:///x').origin).toBe('file://')
  })
})

describe('URLSearchParams CRUD', () => {
  it('parses a query string (leading ? is tolerated)', () => {
    expect(new URLSearchParams('?a=b&c=d').get('a')).toBe('b')
    expect(new URLSearchParams('a=b&c=d').get('c')).toBe('d')
  })

  it('accepts array and record initializers', () => {
    const a = new URLSearchParams([
      ['x', '1'],
      ['y', '2'],
    ])
    expect(a.get('x')).toBe('1')
    const r = new URLSearchParams({ x: '1', y: '2' })
    expect(r.get('y')).toBe('2')
  })

  it('append / get / getAll / has', () => {
    const sp = new URLSearchParams()
    sp.append('a', '1')
    sp.append('a', '2')
    expect(sp.get('a')).toBe('1')
    expect(sp.getAll('a')).toEqual(['1', '2'])
    expect(sp.has('a')).toBe(true)
    expect(sp.has('b')).toBe(false)
    expect(sp.size).toBe(2)
  })

  it('set replaces all existing values for a name', () => {
    const sp = new URLSearchParams('a=1&a=2&a=3')
    sp.set('a', 'x')
    expect(sp.getAll('a')).toEqual(['x'])
    expect(sp.toString()).toBe('a=x')
  })

  it('delete removes by name or name+value', () => {
    const sp = new URLSearchParams('a=1&b=2&a=3')
    sp.delete('a')
    expect(sp.has('a')).toBe(false)
    expect(sp.get('b')).toBe('2')

    const sp2 = new URLSearchParams('a=1&a=2&a=3')
    sp2.delete('a', '2')
    expect(sp2.getAll('a')).toEqual(['1', '3'])
  })

  it('sort orders by name', () => {
    const sp = new URLSearchParams([
      ['b', '1'],
      ['a', '2'],
      ['c', '3'],
    ])
    sp.sort()
    expect([...sp.keys()]).toEqual(['a', 'b', 'c'])
  })

  it('iterates keys/values/entries/forEach', () => {
    const sp = new URLSearchParams('a=1&b=2')
    expect([...sp.keys()]).toEqual(['a', 'b'])
    expect([...sp.values()]).toEqual(['1', '2'])
    expect([...sp.entries()]).toEqual([
      ['a', '1'],
      ['b', '2'],
    ])
    const seen: string[] = []
    sp.forEach((value, name) => seen.push(`${name}=${value}`))
    expect(seen).toEqual(['a=1', 'b=2'])
  })

  it('encodes spaces as + and unsafe chars as percent in toString', () => {
    expect(new URLSearchParams('a=b c').toString()).toBe('a=b+c')
    expect(new URLSearchParams([['a', 'b~c']]).toString()).toBe('a=b%7Ec')
  })

  it('decodes + and percent-encoded sequences on parse', () => {
    const sp = new URLSearchParams('a=b+c&d=e%20f')
    expect(sp.get('a')).toBe('b c')
    expect(sp.get('d')).toBe('e f')
  })
})

describe('URL.searchParams live sync', () => {
  it('mutating searchParams updates the URL', () => {
    const u = new URL('http://example.com/')
    u.searchParams.append('a', 'b')
    expect(u.href).toBe('http://example.com/?a=b')
    expect(u.search).toBe('?a=b')

    u.searchParams.set('a', 'c')
    expect(u.search).toBe('?a=c')

    u.searchParams.delete('a')
    expect(u.search).toBe('')
  })

  it('setting .search updates searchParams', () => {
    const u = new URL('http://example.com/')
    u.search = '?x=1&y=2'
    expect(u.searchParams.get('x')).toBe('1')
    expect(u.searchParams.get('y')).toBe('2')
  })

  it('setting .search to empty clears searchParams', () => {
    const u = new URL('http://example.com/?a=b')
    u.search = ''
    expect(u.searchParams.size).toBe(0)
  })

  it('setting .href reparses searchParams', () => {
    const u = new URL('http://example.com/?a=b')
    u.href = 'http://example.org/?c=d'
    expect(u.hostname).toBe('example.org')
    expect(u.searchParams.get('c')).toBe('d')
  })
})

describe('round-tripping & toJSON', () => {
  it('toString and toJSON return the serialized URL', () => {
    const u = new URL('https://example.com/p?q=1#h')
    expect(u.toString()).toBe('https://example.com/p?q=1#h')
    expect(u.toJSON()).toBe('https://example.com/p?q=1#h')
  })

  it('round-trips through parse/serialize', () => {
    const u = new URL('https://user:pass@example.com:8080/a/b?x=1#frag')
    const v = new URL(u.href)
    expect(v.href).toBe(u.href)
  })
})
