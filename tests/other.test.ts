// 单元测试：对照 WHATWG URL 规范
//   https://url.spec.whatwg.org/#url
//   https://url.spec.whatwg.org/#urlsearchparams
import { describe, it, expect } from 'vitest'
import { URL, URLSearchParams } from '../src/index'

describe('URL 构造与解析 (#url)', () => {
  it('解析绝对 URL 的各部分', () => {
    const u = new URL('https://user:pass@example.com:8080/path/to?q=1#frag')
    expect(u.protocol).toBe('https:')
    expect(u.username).toBe('user')
    expect(u.password).toBe('pass')
    expect(u.hostname).toBe('example.com')
    expect(u.port).toBe('8080')
    expect(u.host).toBe('example.com:8080')
    expect(u.pathname).toBe('/path/to')
    expect(u.search).toBe('?q=1')
    expect(u.hash).toBe('#frag')
    expect(u.href).toBe('https://user:pass@example.com:8080/path/to?q=1#frag')
  })

  it('省略特殊协议的默认端口', () => {
    expect(new URL('http://example.com:80/').port).toBe('')
    expect(new URL('https://example.com:443/').port).toBe('')
    expect(new URL('ws://example.com:80/').port).toBe('')
    expect(new URL('wss://example.com:443/').port).toBe('')
  })

  it('保留非默认端口', () => {
    expect(new URL('http://example.com:8080/').port).toBe('8080')
    expect(new URL('https://example.com:8081/').port).toBe('8081')
  })

  it('自定义（非特殊）协议的端口始终保留', () => {
    const u = new URL('foo://host:123/path')
    expect(u.protocol).toBe('foo:')
    expect(u.host).toBe('host:123')
    expect(u.port).toBe('123')
  })

  it('无路径的特殊协议 URL 的 pathname 为 / 且 href 带尾斜杠', () => {
    const u = new URL('http://example.com')
    expect(u.pathname).toBe('/')
    expect(u.href).toBe('http://example.com/')
  })

  it('基础 URL 相对解析（同目录）', () => {
    expect(new URL('bar', 'http://example.com/foo/').href).toBe('http://example.com/foo/bar')
  })

  it('基础 URL 相对解析（绝对路径覆盖）', () => {
    expect(new URL('/bar', 'http://example.com/foo/').href).toBe('http://example.com/bar')
  })

  it('相对 URL 仅含查询时保留基础路径', () => {
    expect(new URL('?x=1', 'http://example.com/foo').href).toBe('http://example.com/foo?x=1')
  })

  it('相对 URL 仅含片段时保留基础路径', () => {
    expect(new URL('#frag', 'http://example.com/foo/bar').href).toBe(
      'http://example.com/foo/bar#frag',
    )
  })

  it('协议相对 URL (//) 继承基础协议但使用新主机', () => {
    expect(new URL('//other.com/', 'http://example.com/').href).toBe('http://other.com/')
  })

  it('file 协议', () => {
    const u = new URL('file:///path/to/file')
    expect(u.protocol).toBe('file:')
    expect(u.hostname).toBe('')
    expect(u.pathname).toBe('/path/to/file')
    expect(u.origin).toBe('null')
    expect(u.href).toBe('file:///path/to/file')
  })

  it('IPv6 主机', () => {
    const u = new URL('http://[::1]:8080/')
    expect(u.hostname).toBe('[::1]')
    expect(u.port).toBe('8080')
    expect(u.href).toBe('http://[::1]:8080/')
  })

  it('缺少 scheme 且无 base 时抛出 TypeError', () => {
    expect(() => new URL('not a url')).toThrow(TypeError)
  })

  it('特殊协议缺少主机时抛出 TypeError', () => {
    expect(() => new URL('http://')).toThrow(TypeError)
  })

  it('从 URL 实例构造（克隆）', () => {
    const a = new URL('http://user@x.com:8080/p?q=1#h')
    const b = new URL(a)
    expect(b.href).toBe(a.href)
    expect(b).not.toBe(a)
  })
})

describe('URL 属性 (#url)', () => {
  describe('protocol', () => {
    it('getter', () => {
      expect(new URL('https://x.com/').protocol).toBe('https:')
    })
    it('setter 改变协议并影响 href', () => {
      const u = new URL('http://x.com/')
      u.protocol = 'https'
      expect(u.protocol).toBe('https:')
      expect(u.href).toBe('https://x.com/')
    })
    it('setter 忽略非法协议', () => {
      const u = new URL('http://x.com/')
      u.protocol = '123invalid'
      expect(u.protocol).toBe('http:')
    })
  })

  describe('username / password', () => {
    it('getter 解析 userinfo', () => {
      const u = new URL('http://user:pass@x.com/')
      expect(u.username).toBe('user')
      expect(u.password).toBe('pass')
    })
    it('setter 更新 href', () => {
      const u = new URL('http://x.com/')
      u.username = 'user'
      u.password = 'pass'
      expect(u.href).toBe('http://user:pass@x.com/')
    })
  })

  describe('host / hostname / port', () => {
    it('host getter 包含端口', () => {
      expect(new URL('http://x.com:8080/').host).toBe('x.com:8080')
    })
    it('hostname getter', () => {
      expect(new URL('http://x.com:8080/').hostname).toBe('x.com')
    })
    it('host setter 解析 host:port', () => {
      const u = new URL('http://x.com/')
      u.host = 'y.com:9999'
      expect(u.hostname).toBe('y.com')
      expect(u.port).toBe('9999')
      expect(u.href).toBe('http://y.com:9999/')
    })
    it('port setter 省略默认端口', () => {
      const u = new URL('http://x.com/')
      u.port = '80'
      expect(u.port).toBe('')
    })
    it('port setter 保留非默认端口', () => {
      const u = new URL('http://x.com/')
      u.port = '8080'
      expect(u.port).toBe('8080')
    })
    it('port setter 忽略非法值', () => {
      const u = new URL('http://x.com/')
      u.port = 'abc'
      expect(u.port).toBe('')
    })
    it('IPv6 的 host setter 保留端口', () => {
      const u = new URL('http://[::1]/')
      u.host = '[::1]:8080'
      expect(u.hostname).toBe('[::1]')
      expect(u.port).toBe('8080')
    })
  })

  describe('pathname', () => {
    it('归一化 . 和 .. 段', () => {
      const u = new URL('http://x.com/a/b/../c/./d')
      expect(u.pathname).toBe('/a/c/d')
    })
    it('保留空段', () => {
      const u = new URL('http://x.com/a//b')
      expect(u.pathname).toBe('/a//b')
    })
    it('setter 归一化', () => {
      const u = new URL('http://x.com/')
      u.pathname = '/x/./y/../z'
      expect(u.pathname).toBe('/x/z')
    })
  })

  describe('search / searchParams', () => {
    it('search getter/setter', () => {
      const u = new URL('http://x.com/?a=1')
      expect(u.search).toBe('?a=1')
      u.search = '?b=2'
      expect(u.search).toBe('?b=2')
      expect(u.searchParams.get('b')).toBe('2')
    })
    it('searchParams 与 URL 双向绑定（append）', () => {
      const u = new URL('http://x.com/?a=1')
      u.searchParams.append('b', '2')
      expect(u.search).toBe('?a=1&b=2')
    })
    it('修改 search 后 searchParams 重新解析', () => {
      const u = new URL('http://x.com/?a=1')
      u.search = '?c=3'
      expect(u.searchParams.get('c')).toBe('3')
      expect(u.searchParams.has('a')).toBe(false)
    })
  })

  describe('hash', () => {
    it('getter/setter', () => {
      const u = new URL('http://x.com/#frag')
      expect(u.hash).toBe('#frag')
      u.hash = '#sec'
      expect(u.hash).toBe('#sec')
      u.hash = ''
      expect(u.hash).toBe('')
    })
  })

  describe('origin', () => {
    it('特殊协议返回 origin', () => {
      expect(new URL('http://x.com/').origin).toBe('http://x.com')
      expect(new URL('http://x.com:8080/').origin).toBe('http://x.com:8080')
      expect(new URL('https://x.com/').origin).toBe('https://x.com')
      expect(new URL('ws://x.com/').origin).toBe('ws://x.com')
      expect(new URL('wss://x.com/').origin).toBe('wss://x.com')
      expect(new URL('ftp://x.com/').origin).toBe('ftp://x.com')
    })
    it('file 与自定义协议返回 null', () => {
      expect(new URL('file:///').origin).toBe('null')
      expect(new URL('foo://x.com/').origin).toBe('null')
    })
  })

  describe('toString / toJSON', () => {
    it('等于 href', () => {
      const u = new URL('http://x.com/p?q=1#h')
      expect(u.toString()).toBe(u.href)
      expect(u.toJSON()).toBe(u.href)
    })
  })
})

describe('URLSearchParams 构造 (#urlsearchparams)', () => {
  it('从查询字符串', () => {
    const p = new URLSearchParams('a=1&b=2&a=3')
    expect(p.get('a')).toBe('1')
    expect(p.getAll('a')).toEqual(['1', '3'])
    expect(p.has('b')).toBe(true)
    expect(p.size).toBe(3)
  })
  it('忽略前导 ?', () => {
    const p = new URLSearchParams('?a=1')
    expect(p.get('a')).toBe('1')
  })
  it('无 = 的条目值为空', () => {
    const p = new URLSearchParams('a')
    expect(p.get('a')).toBe('')
    expect(p.has('a')).toBe(true)
    expect(p.size).toBe(1)
  })
  it('从数组', () => {
    const p = new URLSearchParams([
      ['a', '1'],
      ['b', '2'],
    ])
    expect(p.get('a')).toBe('1')
    expect(p.get('b')).toBe('2')
  })
  it('从对象', () => {
    const p = new URLSearchParams({ a: '1', b: '2' })
    expect(p.get('a')).toBe('1')
    expect(p.get('b')).toBe('2')
  })
  it('从另一个 URLSearchParams（克隆）', () => {
    const p = new URLSearchParams('a=1')
    const q = new URLSearchParams(p)
    expect(q.get('a')).toBe('1')
    q.append('b', '2')
    expect(p.has('b')).toBe(false)
  })
})

describe('URLSearchParams 方法 (#urlsearchparams)', () => {
  it('append', () => {
    const p = new URLSearchParams('a=1')
    p.append('a', '2')
    expect(p.getAll('a')).toEqual(['1', '2'])
  })
  it('delete 不带 value', () => {
    const p = new URLSearchParams('a=1&b=2')
    p.delete('a')
    expect(p.has('a')).toBe(false)
    expect(p.has('b')).toBe(true)
  })
  it('delete 带 value', () => {
    const p = new URLSearchParams('a=1&a=2&a=3')
    p.delete('a', '2')
    expect(p.getAll('a')).toEqual(['1', '3'])
  })
  it('get / getAll', () => {
    const p = new URLSearchParams('a=1&a=2')
    expect(p.get('a')).toBe('1')
    expect(p.getAll('a')).toEqual(['1', '2'])
    expect(p.get('x')).toBe(null)
  })
  it('has 带 value', () => {
    const p = new URLSearchParams('a=1&a=2')
    expect(p.has('a', '1')).toBe(true)
    expect(p.has('a', '3')).toBe(false)
  })
  it('set 替换首个并移除其余，不存在则新增', () => {
    const p = new URLSearchParams('a=1&a=2&b=3')
    p.set('a', 'X')
    expect(p.getAll('a')).toEqual(['X'])
    expect(p.toString()).toBe('a=X&b=3')
    p.set('c', '9')
    expect(p.get('c')).toBe('9')
  })
  it('sort 按 key 字典序', () => {
    const p = new URLSearchParams('b=2&a=1&c=3')
    p.sort()
    expect(p.toString()).toBe('a=1&b=2&c=3')
  })
  it('forEach 传入正确参数与 thisArg', () => {
    const p = new URLSearchParams('a=1&b=2')
    const seen: [string, string][] = []
    const thisArg: any = { id: 42 }
    p.forEach(function (this: any, value: string, key: string) {
      seen.push([key, value])
      this.touched = true
    }, thisArg)
    expect(seen).toEqual([
      ['a', '1'],
      ['b', '2'],
    ])
    expect(thisArg.touched).toBe(true)
  })
  it('keys / values / entries / Symbol.iterator', () => {
    const p = new URLSearchParams('a=1&b=2')
    expect([...p.keys()]).toEqual(['a', 'b'])
    expect([...p.values()]).toEqual(['1', '2'])
    expect([...p.entries()]).toEqual([
      ['a', '1'],
      ['b', '2'],
    ])
    expect([...p]).toEqual([
      ['a', '1'],
      ['b', '2'],
    ])
  })
  it('size', () => {
    expect(new URLSearchParams('a=1&b=2&c=3').size).toBe(3)
  })
  it('toString 编码：空格转 +，特殊字符 percent-encode', () => {
    expect(new URLSearchParams([['a b', 'c d']]).toString()).toBe('a+b=c+d')
    expect(new URLSearchParams([['a', 'b=c']]).toString()).toBe('a=b%3Dc')
    expect(new URLSearchParams([['a', 'b&c']]).toString()).toBe('a=b%26c')
  })
  it('解析时 + 与 %20 还原为空格', () => {
    expect(new URLSearchParams('a=b+c').get('a')).toBe('b c')
    expect(new URLSearchParams('a=b%20c').get('a')).toBe('b c')
  })
})

describe('URLSearchParams 与 URL 联动', () => {
  it('已绑定 URL 时 append 同步 search', () => {
    const u = new URL('http://x.com/?a=1')
    u.searchParams.append('b', '2')
    expect(u.search).toBe('?a=1&b=2')
  })
  it('set search 后旧 params 实例失效，新实例重新解析', () => {
    const u = new URL('http://x.com/?a=1')
    const p = u.searchParams
    u.search = '?c=3'
    expect(p.get('c')).toBe(null)
    expect(u.searchParams.get('c')).toBe('3')
  })
})

describe('URL 边缘用例 (#url)', () => {
  it('scheme 小写化（protocol getter）', () => {
    expect(new URL('HTTP://x.com/').protocol).toBe('http:')
  })
  it('带点/加号的协议名合法', () => {
    expect(new URL('a.b+c://x.com/').protocol).toBe('a.b+c:')
  })
  it('http 上非默认端口 443 保留', () => {
    expect(new URL('http://x.com:443').port).toBe('443')
  })
  it('前导零端口按数值解析（80 被省略）', () => {
    expect(new URL('http://x.com:0080').port).toBe('')
  })
  it('端口 0 保留', () => {
    expect(new URL('http://x.com:0').port).toBe('0')
  })
  it('相对路径 .. 超出根目录后停在 /', () => {
    expect(new URL('../../x', 'http://x.com/a').pathname).toBe('/x')
  })
  it('相对路径 ./x 拼接', () => {
    expect(new URL('./x', 'http://x.com/a/').href).toBe('http://x.com/a/x')
  })
  it('空 URL 字符串继承 base', () => {
    expect(new URL('', 'http://x.com/a').href).toBe('http://x.com/a')
  })
  it('路径中的空段被保留', () => {
    expect(new URL('http://x.com/a//b/').pathname).toBe('/a//b/')
  })
  it('file 协议带主机', () => {
    const u = new URL('file://host/path')
    expect(u.hostname).toBe('host')
    expect(u.pathname).toBe('/path')
  })
  it('file 协议单斜杠路径', () => {
    const u = new URL('file:/path')
    expect(u.hostname).toBe('')
    expect(u.pathname).toBe('/path')
  })
  it('search 赋值忽略前导 ?', () => {
    const u = new URL('http://x.com/')
    u.search = 'a=1'
    expect(u.search).toBe('?a=1')
  })
  it('hash 赋值忽略前导 #', () => {
    const u = new URL('http://x.com/')
    u.hash = 'frag'
    expect(u.hash).toBe('#frag')
  })
  it('hash 中的正斜杠不应被编码', () => {
    expect(new URL('http://x.com/#a/b/c').hash).toBe('#a/b/c')
    const u = new URL('http://x.com/')
    u.hash = 'x/y?z'
    expect(u.hash).toBe('#x/y?z')
  })
  it('searchParams.sort 同步到 search', () => {
    const u = new URL('http://x.com/?b=2&a=1')
    u.searchParams.sort()
    expect(u.search).toBe('?a=1&b=2')
  })
  it('重新赋值 href 替换所有部分', () => {
    const u = new URL('http://x.com/')
    u.href = 'https://y.com/p'
    expect(u.href).toBe('https://y.com/p')
  })
  it('search 清空后 searchParams 为空', () => {
    const u = new URL('http://x.com/?a=1')
    u.search = ''
    expect(u.searchParams.size).toBe(0)
  })
  it('ws 协议设置默认端口 80 被省略', () => {
    const u = new URL('ws://x.com/')
    u.port = '80'
    expect(u.port).toBe('')
  })
  it('URL 构造后可 toString 往返', () => {
    const u = new URL('http://x.com/a?b=1#c')
    expect(new URL(u.toString()).href).toBe(u.href)
  })
})

describe('URLSearchParams 边缘用例 (#urlsearchparams)', () => {
  it('尾随 & 被忽略', () => {
    expect(new URLSearchParams('a=1&').size).toBe(1)
  })
  it('连续 && 产生两个条目', () => {
    expect(new URLSearchParams('a=1&&b=2').size).toBe(2)
  })
  it('空 key', () => {
    expect(new URLSearchParams('=value').get('')).toBe('value')
  })
  it('同名多值', () => {
    expect(new URLSearchParams('a=1&a=2').getAll('a')).toEqual(['1', '2'])
  })
  it('append 后 toString 编码空格与 =', () => {
    const p = new URLSearchParams()
    p.append('a b', 'c=d')
    expect(p.toString()).toBe('a+b=c%3Dd')
  })
  it('set 不存在的 key 时新增', () => {
    const p = new URLSearchParams('a=1')
    p.set('b', '2')
    expect(p.get('b')).toBe('2')
  })
  it('delete 不存在的 key 不抛错', () => {
    const p = new URLSearchParams('a=1')
    expect(() => p.delete('x')).not.toThrow()
  })
  it('空 URLSearchParams 的 size 为 0', () => {
    expect(new URLSearchParams().size).toBe(0)
  })
  it('构造自空字符串 size 为 0', () => {
    expect(new URLSearchParams('').size).toBe(0)
  })
  it('has 配合空字符串 key', () => {
    expect(new URLSearchParams('=1').has('')).toBe(true)
  })
})

describe('URL 与 URLSearchParams 规范边界用例', () => {
  it('特殊协议主机名应 ASCII 小写化', () => {
    expect(new URL('HTTP://X.COM/').href).toBe('http://x.com/')
  })
  it('相对引用 . 应保留尾斜杠', () => {
    expect(new URL('.', 'http://x.com/a/b').href).toBe('http://x.com/a/')
  })
  it('hash 序列化应对空格做 percent-encode', () => {
    expect(new URL('http://x.com/#frag ment').hash).toBe('#frag%20ment')
  })
  it('username 序列化应对空格做 percent-encode', () => {
    const u = new URL('http://x.com/')
    u.username = 'a b'
    expect(u.href).toBe('http://a%20b@x.com/')
  })
  it('IDN 域名 + 自定义端口 + 非 ASCII 查询 + 特殊字符片段', () => {
    const u = new URL('https://赔钱机场.我爱你:9090/fjdklsa?yes=发点击开始了&no=@#*/pages/index')
    expect(u.protocol).toBe('https:')
    // 非默认端口保留
    expect(u.port).toBe('9090')
    // IDN 域名按 punycode（IDNA lite）序列化为 ASCII：赔钱机场→xn--mes358aby2apfg，我爱你→xn--6qq986b3xl
    expect(u.hostname).toBe('xn--mes358aby2apfg.xn--6qq986b3xl')
    expect(u.host).toBe('xn--mes358aby2apfg.xn--6qq986b3xl:9090')
    expect(u.pathname).toBe('/fjdklsa')
    // 查询中的非 ASCII 字符按 UTF-8 percent-encode；'@' 属于查询保留集不被编码
    expect(u.search).toBe('?yes=%E5%8F%91%E7%82%B9%E5%87%BB%E5%BC%80%E5%A7%8B%E4%BA%86&no=@')
    // 片段中的 '*' 与 '/' 不被编码
    expect(u.hash).toBe('#*/pages/index')
    expect(u.href).toBe(
      'https://xn--mes358aby2apfg.xn--6qq986b3xl:9090/fjdklsa?yes=%E5%8F%91%E7%82%B9%E5%87%BB%E5%BC%80%E5%A7%8B%E4%BA%86&no=@#*/pages/index',
    )
  })
})
