/**
 * web.ts — WHATWG URL / URLSearchParams polyfill
 *
 * 设计目标：
 *  - 零 DOM / 零全局环境依赖（不引用 globalThis / window / self / document / location），
 *    可在node、小程序、V8、Worker 等受限环境运行。
 *  - 以 es2023 为目标，编码直接使用 encodeURIComponent / decodeURIComponent 等内置方法。
 *  - 解析使用单条正则；序列化为模板字符串拼接。
 *
 * 说明：覆盖日常可用的绝大部分 WHATWG URL 语义；个别边缘编码细节（如 ' 与 ~）
 * 遵循 encodeURIComponent 的默认行为（即不强制编码）。
 */

// 单条正则解析 URL 的 7 个组成部分：
//   1: scheme  2: userinfo  3: host  4: port  5: path  6: query  7: fragment
const RE =
  /^(?:([^:/?#]+):)?(?:\/\/(?:(?:([^@]*?)@)?((?:\[[^\]]*\]|[^:/?#]*))(?::(\d*))?)?)?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i

// 已知协议及其默认端口；file 的默认端口记为 null（无默认端口）
const SCHEMES: Record<string, number | null> = {
  ftp: 21,
  file: null,
  http: 80,
  https: 443,
  ws: 80,
  wss: 443,
}

// 查询参数编码：标准 percent-encode 后再把空格转成 '+'
const encode = (s: string) => encodeURIComponent(s).replace(/%20/g, '+')
// 查询参数解码：'+' 还原为空格后做 percent-decode，失败则原样返回
const decode = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '))
  } catch {
    return s
  }
}

// 序列化用 percent-encode（用于 fragment 与 userinfo）；幂等于已编码输入，避免双重编码
const enc = (s: string) => {
  try {
    s = decodeURIComponent(s)
  } catch {}
  return encodeURIComponent(s)
}
// userinfo 形如 name:password，需分别编码且保留分隔的 ':'
const encUI = (s: string) => {
  const i = s.indexOf(':')
  return i < 0 ? enc(s) : `${enc(s.slice(0, i))}:${enc(s.slice(i + 1))}`
}

// 路径「点段」归一化：去掉 '.' 与 '..'，但保留路径中的空段（如 'a//b'）
const normalizePath = (path: string) => {
  const out: string[] = []
  let first = true
  for (const seg of path.split('/')) {
    if (seg === '..') out.pop()
    else if (seg !== '.') {
      if (seg === '' && first) {
        first = false
        continue
      }
      out.push(seg)
    }
    first = false
  }
  return `${path[0] === '/' ? '/' : ''}${out.join('/')}`
}

export class URLSearchParams {
  #list: [string, string][] = []
  #url: URL | undefined

  constructor(init?: string[][] | Record<string, string> | string | URLSearchParams) {
    if (typeof init === 'string') {
      const body = init[0] === '?' ? init.slice(1) : init
      for (const pair of body.split('&')) {
        if (!pair) continue
        const eq = pair.indexOf('=')
        const key = eq < 0 ? pair : pair.slice(0, eq)
        const val = eq < 0 ? '' : pair.slice(eq + 1)
        this.#list.push([decode(key), decode(val)])
      }
    } else if (init instanceof URLSearchParams) {
      this.#list = init.#list.map(x => x.slice()) as [string, string][]
    } else if (Array.isArray(init)) {
      for (const [k, v] of init) this.#list.push([String(k), String(v)])
    } else if (init) {
      for (const k in init) this.#list.push([k, String((init as any)[k])])
    }
  }

  // 若已绑定到某个 URL，则同步更新其查询串
  #sync() {
    if (this.#url) this.#url._setSearch(this.toString())
  }
  _bind(url: URL) {
    this.#url = url
  }

  append(key: string, value: string) {
    this.#list.push([key, value])
    this.#sync()
  }
  delete(key: string, value?: string) {
    this.#list =
      value === undefined
        ? this.#list.filter(x => x[0] !== key)
        : this.#list.filter(x => !(x[0] === key && x[1] === value))
    this.#sync()
  }
  get(key: string) {
    for (const x of this.#list) if (x[0] === key) return x[1]
    return null
  }
  getAll(key: string) {
    return this.#list.filter(x => x[0] === key).map(x => x[1])
  }
  has(key: string, value?: string) {
    return value === undefined
      ? this.#list.some(x => x[0] === key)
      : this.#list.some(x => x[0] === key && x[1] === value)
  }
  set(key: string, value: string) {
    let seen = false
    const next: [string, string][] = []
    for (const x of this.#list) {
      if (x[0] === key) {
        if (!seen) {
          next.push([key, value])
          seen = true
        }
      } else next.push(x)
    }
    if (!seen) next.push([key, value])
    this.#list = next
    this.#sync()
  }
  sort() {
    this.#list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    this.#sync()
  }
  forEach(cb: any, thisArg?: any) {
    for (const x of this.#list) cb.call(thisArg, x[1], x[0], this)
  }
  keys() {
    return this.#list.map(x => x[0])[Symbol.iterator]()
  }
  values() {
    return this.#list.map(x => x[1])[Symbol.iterator]()
  }
  entries() {
    return this.#list.map(x => x.slice())[Symbol.iterator]()
  }
  *[Symbol.iterator]() {
    yield* this.#list
  }
  toString() {
    return this.#list.map(x => `${encode(x[0])}=${encode(x[1])}`).join('&')
  }
  get size() {
    return this.#list.length
  }
}

export class URL {
  #scheme = ''
  #userinfo = ''
  #host = ''
  #port = ''
  #path = ''
  #query = ''
  #fragment = ''
  #params: URLSearchParams | null = null

  constructor(url: string | URL, base?: string | URL) {
    if (url instanceof URL) {
      // 传入 URL 实例：克隆其各组成部分，base 被忽略
      this.#scheme = url.#scheme
      this.#userinfo = url.#userinfo
      this.#host = url.#host
      this.#port = url.#port
      this.#path = url.#path
      this.#query = url.#query
      this.#fragment = url.#fragment
      return
    }
    const baseUrl = base != null ? (base instanceof URL ? base : new URL(base)) : null
    const m = RE.exec(url) || []
    const query = m[6]
    const fragment = m[7]
    let scheme = '',
      userinfo = '',
      host = '',
      port = '',
      path = m[5] || ''
    if (m[1]) {
      scheme = m[1].toLowerCase()
      userinfo = m[2] ? encUI(m[2]) : ''
      host = m[3] || ''
      port = m[4] && SCHEMES[scheme] !== +m[4] ? m[4] : ''
    } else if (baseUrl) {
      scheme = baseUrl.#scheme
      if (m[3] !== undefined) {
        // 协议相对 URL：authority 取自相对 URL 本身
        userinfo = m[2] ? encUI(m[2]) : ''
        host = m[3] || ''
        port = m[4] && SCHEMES[scheme] !== +m[4] ? m[4] : ''
      } else {
        // 无 authority：继承 base 的 host/port 与 path
        userinfo = baseUrl.#userinfo
        host = baseUrl.#host
        port = baseUrl.#port
        if (path && path[0] !== '/') {
          const dir = baseUrl.#path.split('/').slice(0, -1).join('/')
          path = `${dir}/${path}`
        } else if (!path) {
          path = baseUrl.#path
        }
      }
    }
    this.#scheme = scheme
    if (SCHEMES[scheme] != null) host = host.toLowerCase()
    this.#userinfo = userinfo
    this.#host = host
    this.#port = port
    const resolvedPath = path ? normalizePath(path) : host || SCHEMES[scheme] != null ? '/' : ''
    if (SCHEMES[scheme] != null && scheme !== 'file') {
      const lastSeg = path.split('/').filter(Boolean).pop()
      this.#path = lastSeg === '.' || lastSeg === '..' ? `${resolvedPath}/` : resolvedPath
    } else {
      this.#path = resolvedPath
    }
    this.#query = query != null ? query : ''
    this.#fragment = fragment != null ? enc(fragment) : ''
    if (!this.#scheme) throw new TypeError(`Invalid URL: ${url}`)
    if (!baseUrl && SCHEMES[this.#scheme] != null && this.#scheme !== 'file' && !this.#host)
      throw new TypeError(`Invalid URL: ${url}`)
  }

  // 供 URLSearchParams 回写查询串
  _setSearch(search: string) {
    this.#query = search
  }

  get href() {
    const hasAuthority = this.#host || SCHEMES[this.#scheme] != null || this.#scheme === 'file'
    const auth = this.#userinfo ? `${this.#userinfo}@` : ''
    const authority = hasAuthority
      ? `//${auth}${this.#host}${this.#port ? `:${this.#port}` : ''}`
      : ''
    return `${this.#scheme}:${authority}${this.#path}${this.#query ? `?${this.#query}` : ''}${this.#fragment ? `#${this.#fragment}` : ''}`
  }
  set href(value: string) {
    const u = new URL(value)
    this.#scheme = u.#scheme
    this.#userinfo = u.#userinfo
    this.#host = u.#host
    this.#port = u.#port
    this.#path = u.#path
    this.#query = u.#query
    this.#fragment = u.#fragment
    this.#params = null
  }
  get protocol() {
    return `${this.#scheme}:`
  }
  set protocol(value: string) {
    const s = value.replace(/:.*/, '').toLowerCase()
    if (/^[a-z][a-z0-9+\-.]*$/.test(s)) this.#scheme = s
  }
  get username() {
    return this.#userinfo.includes(':')
      ? this.#userinfo.slice(0, this.#userinfo.indexOf(':'))
      : this.#userinfo
  }
  set username(value: string) {
    const idx = this.#userinfo.indexOf(':')
    this.#userinfo = this.#host
      ? `${enc(value)}${idx >= 0 ? `:${this.#userinfo.slice(idx + 1)}` : ''}`
      : ''
  }
  get password() {
    const idx = this.#userinfo.indexOf(':')
    return idx >= 0 ? this.#userinfo.slice(idx + 1) : ''
  }
  set password(value: string) {
    this.#userinfo = this.#host ? `${this.username}:${enc(value)}` : ''
  }
  get host() {
    return `${this.#host}${this.#port ? `:${this.#port}` : ''}`
  }
  set host(value: string) {
    const i = value.lastIndexOf(':')
    let h = value
    if (value[0] === '[') {
      h = value.slice(0, value.indexOf(']') + 1)
      if (i > value.indexOf(']')) this.#port = value.slice(i + 1)
    } else if (i > 0 && /^\d*$/.test(value.slice(i + 1))) {
      h = value.slice(0, i)
      this.#port = value.slice(i + 1)
    }
    this.#host = SCHEMES[this.#scheme] != null ? h.toLowerCase() : h
  }
  get hostname() {
    return this.#host
  }
  set hostname(value: string) {
    this.#host = SCHEMES[this.#scheme] != null ? value.toLowerCase() : value
  }
  get port() {
    return this.#port
  }
  set port(value: string) {
    this.#port = /^\d+$/.test(value) && SCHEMES[this.#scheme] !== +value ? value : ''
  }
  get pathname() {
    return this.#path
  }
  set pathname(value: string) {
    this.#path = normalizePath(value)
  }
  get search() {
    return `${this.#query ? `?${this.#query}` : ''}`
  }
  set search(value: string) {
    this.#query = value ? value.replace(/^\?/, '') : ''
    this.#params = null
  }
  get searchParams() {
    if (!this.#params) {
      this.#params = new URLSearchParams(this.#query)
      this.#params._bind(this)
    }
    return this.#params
  }
  get hash() {
    return `${this.#fragment ? `#${this.#fragment}` : ''}`
  }
  set hash(value: string) {
    this.#fragment = value ? enc(value.replace(/^#/, '')) : ''
  }
  get origin() {
    if (SCHEMES[this.#scheme] == null) return 'null'
    return `${this.#scheme}://${this.#host}${this.#port ? `:${this.#port}` : ''}`
  }
  toString() {
    return this.href
  }
  toJSON() {
    return this.href
  }
}
