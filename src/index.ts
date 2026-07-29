/**
 * @blyou/whatwg-url — a zero-dependency, WHATWG URL & URLSearchParams
 * implementation for DOM-less ES2023 environments.
 * Follows https://url.spec.whatwg.org/ .
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: false })
const utf8Encode = (s: string): Uint8Array => encoder.encode(s)
const utf8Decode = (b: Uint8Array): string => decoder.decode(b)

const isAlpha = (cp: number) => (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)
const isDigit = (cp: number) => cp >= 0x30 && cp <= 0x39
const isAlnum = (cp: number) => isAlpha(cp) || isDigit(cp)
const isHex = (cp: number) =>
  isDigit(cp) || (cp >= 0x41 && cp <= 0x46) || (cp >= 0x61 && cp <= 0x66)
const hexVal = (cp: number) => (cp <= 0x39 ? cp - 0x30 : cp <= 0x46 ? cp - 0x37 : cp - 0x57)
const isC0OrSpace = (cp: number) => cp >= 0x00 && cp <= 0x20
const isASCII = (s: string) => {
  for (const ch of s) if (ch.codePointAt(0)! >= 128) return false
  return true
}
function hexAt(arr: string[], i: number): boolean {
  return i < arr.length && isHex(arr[i].codePointAt(0)!)
}

const isForbiddenHostCP = (cp: number) =>
  cp === 0x00 ||
  cp === 0x09 ||
  cp === 0x0a ||
  cp === 0x0d ||
  cp === 0x20 ||
  cp === 0x23 ||
  cp === 0x2f ||
  cp === 0x3a ||
  cp === 0x3c ||
  cp === 0x3e ||
  cp === 0x3f ||
  cp === 0x40 ||
  cp === 0x5b ||
  cp === 0x5c ||
  cp === 0x5d ||
  cp === 0x5e ||
  cp === 0x7c

const isURLCP = (cp: number) =>
  isAlnum(cp) ||
  [
    0x21, 0x24, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x3a, 0x3b, 0x3d, 0x3f,
    0x40, 0x5f, 0x7e,
  ].includes(cp) ||
  (cp >= 0x00a0 && cp <= 0x10fffd && (cp < 0xd800 || cp > 0xdfff))

// ---- percent-encoding sets ----
const inC0 = (cp: number) => (cp >= 0x00 && cp <= 0x1f) || cp > 0x7e
const inFrag = (cp: number) => inC0(cp) || [0x20, 0x22, 0x3c, 0x3e, 0x60].includes(cp)
const inQuery = (cp: number) => inC0(cp) || [0x20, 0x22, 0x23, 0x3c, 0x3e].includes(cp)
const inSQuery = (cp: number) => inQuery(cp) || cp === 0x27
const inPath = (cp: number) => inQuery(cp) || [0x3f, 0x5e, 0x60, 0x7b, 0x7d].includes(cp)
const inUser = (cp: number) =>
  inPath(cp) ||
  cp === 0x2f ||
  cp === 0x3a ||
  cp === 0x3b ||
  cp === 0x3d ||
  cp === 0x40 ||
  (cp >= 0x5b && cp <= 0x5d) ||
  cp === 0x7c
const inForm = (cp: number) => !(isAlnum(cp) || [0x2a, 0x2d, 0x2e, 0x5f].includes(cp))

const pctByte = (b: number) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`

function percentDecodeBytes(input: Uint8Array): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < input.length; i++) {
    const b = input[i]
    if (b === 0x25 && i + 2 < input.length && isHex(input[i + 1]) && isHex(input[i + 2])) {
      out.push(parseInt(String.fromCharCode(input[i + 1], input[i + 2]), 16))
      i += 2
    } else out.push(b)
  }
  return Uint8Array.from(out)
}

function utf8PctCP(cp: number, set: (cp: number) => boolean): string {
  if (!set(cp)) return String.fromCodePoint(cp)
  let out = ''
  for (const b of utf8Encode(String.fromCodePoint(cp))) out += pctByte(b)
  return out
}
function utf8Pct(s: string, set: (cp: number) => boolean): string {
  let out = ''
  for (const ch of s) out += utf8PctCP(ch.codePointAt(0)!, set)
  return out
}
function formPct(s: string): string {
  let out = ''
  for (const b of utf8Encode(s))
    out += b === 0x20 ? '+' : !inForm(b) ? String.fromCharCode(b) : pctByte(b)
  return out
}

// ---- punycode (RFC 3492) ----
const BASE = 36,
  TMIN = 1,
  TMAX = 26,
  SKEW = 38,
  DAMP = 700,
  INIT_BIAS = 72,
  INIT_N = 128
const pDigit = (d: number) => String.fromCharCode(d < 26 ? d + 0x61 : d - 26 + 0x30)
function adapt(delta: number, n: number, first: boolean): number {
  delta = first ? Math.floor(delta / DAMP) : delta >> 1
  delta += Math.floor(delta / n)
  let k = 0
  while (delta > ((BASE - TMIN) * TMAX) >> 1) {
    delta = Math.floor(delta / (BASE - TMIN))
    k += BASE
  }
  return Math.floor(k + ((BASE - TMIN + 1) * delta) / (delta + SKEW))
}
function punyEncode(input: string): string {
  const chars = [...input]
  let n = INIT_N,
    delta = 0,
    bias = INIT_BIAS,
    handled = 0,
    out = ''
  for (const ch of chars)
    if (ch.codePointAt(0)! < 128) {
      out += ch
      handled++
    }
  const basic = handled
  if (basic > 0) out += '-'
  while (handled < chars.length) {
    let m = Infinity
    for (const ch of chars) {
      const cp = ch.codePointAt(0)!
      if (cp >= n && cp < m) m = cp
    }
    delta += (m - n) * (handled + 1)
    n = m
    for (const ch of chars) {
      const cp = ch.codePointAt(0)!
      if (cp < n) delta++
      else if (cp === n) {
        let q = delta
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias
          if (q < t) break
          out += pDigit(t + ((q - t) % (BASE - t)))
          q = Math.floor((q - t) / (BASE - t))
        }
        out += pDigit(q)
        bias = adapt(delta, handled + 1, handled === basic)
        delta = 0
        handled++
      }
    }
    delta++
    n++
  }
  return out
}
function domainToASCII(domain: string): string | null {
  if (isASCII(domain)) return domain.toLowerCase()
  let norm = domain
  try {
    norm = domain.normalize('NFC')
  } catch {
    /* ignore */
  }
  const labels = norm.split('.')
  const ascii = labels.map(l => (isASCII(l) ? l.toLowerCase() : `xn--${punyEncode(l)}`))
  const result = ascii.join('.')
  if (result === '') return null
  for (const ch of result) {
    const cp = ch.codePointAt(0)!
    if (isForbiddenHostCP(cp) || cp <= 0x1f || cp === 0x7f || cp === 0x25) return null
  }
  return result
}

// ---- host parsing ----
export type Host =
  | { kind: 'none' }
  | { kind: 'empty' }
  | { kind: 'domain'; value: string }
  | { kind: 'ipv4'; value: number }
  | { kind: 'ipv6'; value: number[] }
  | { kind: 'opaque'; value: string }

function parseIPv4Number(input: string): [number, boolean] | null {
  if (input === '') return null
  let err = false,
    r = 10
  if (input.length >= 2 && (input.startsWith('0x') || input.startsWith('0X'))) {
    err = true
    input = input.slice(2)
    r = 16
  } else if (input.length >= 2 && input[0] === '0') {
    err = true
    input = input.slice(1)
    r = 8
  }
  if (input === '') return [0, true]
  for (const ch of input) if (Number.isNaN(parseInt(ch, r)) || parseInt(ch, r) >= r) return null
  const out = parseInt(input, r)
  if (Number.isNaN(out)) return null
  return [out, err]
}
function parseIPv4(input: string): number | null {
  const parts = input.split('.')
  if (parts[parts.length - 1] === '') {
    if (parts.length > 1) parts.pop()
  }
  if (parts.length > 4) return null
  const nums: number[] = []
  for (const p of parts) {
    const r = parseIPv4Number(p)
    if (r === null) return null
    nums.push(r[0])
  }
  for (let i = 0; i < nums.length - 1; i++) if (nums[i] > 255) return null
  if (nums[nums.length - 1] >= Math.pow(256, 5 - nums.length)) return null
  let ipv4 = nums[nums.length - 1]
  nums.pop()
  let counter = 0
  for (const nm of nums) {
    ipv4 += nm * Math.pow(256, 3 - counter)
    counter++
  }
  return ipv4
}
function endsInNumber(input: string): boolean {
  const parts = input.split('.')
  if (parts[parts.length - 1] === '') parts.pop()
  const last = parts[parts.length - 1]
  if (last === undefined) return false
  if (last !== '' && /^[0-9]+$/.test(last)) return true
  return parseIPv4Number(last) !== null
}
function parseIPv6(input: string): number[] | null {
  const pieces = [0, 0, 0, 0, 0, 0, 0, 0]
  let pieceIndex = 0,
    compress: number | null = null
  const chars = [...input].map(c => c.codePointAt(0)!)
  let pointer = 0
  const atEnd = () => pointer >= chars.length
  const cur = () => (atEnd() ? null : chars[pointer])
  if (cur() === 0x3a) {
    if (chars[pointer + 1] !== 0x3a) return null
    pointer += 2
    pieceIndex++
    compress = pieceIndex
  }
  while (!atEnd()) {
    if (pieceIndex === 8) return null
    if (cur() === 0x3a) {
      if (compress !== null) return null
      pointer++
      pieceIndex++
      compress = pieceIndex
      continue
    }
    let value = 0,
      length = 0
    while (length < 4 && isHex(cur()!)) {
      value = value * 0x10 + hexVal(cur()!)
      pointer++
      length++
    }
    if (cur() === 0x2e) {
      if (length === 0) return null
      pointer -= length
      if (pieceIndex > 6) return null
      let numbersSeen = 0
      while (!atEnd()) {
        let ipv4Piece: number | null = null
        if (numbersSeen > 0) {
          if (cur() === 0x2e && numbersSeen < 4) pointer++
          else return null
        }
        if (!isDigit(cur()!)) return null
        while (isDigit(cur()!)) {
          const number = cur()! - 0x30
          if (ipv4Piece === null) ipv4Piece = number
          else if (ipv4Piece === 0) return null
          else ipv4Piece = ipv4Piece * 10 + number
          if ((ipv4Piece as number) > 255) return null
          pointer++
        }
        pieces[pieceIndex] = pieces[pieceIndex] * 0x100 + (ipv4Piece as number)
        numbersSeen++
        if (numbersSeen === 2 || numbersSeen === 4) pieceIndex++
      }
      if (numbersSeen !== 4) return null
      break
    } else if (cur() === 0x3a) {
      pointer++
      if (atEnd()) return null
    } else if (cur() !== null) {
      return null
    }
    if (length > 1 && value < Math.pow(16, length - 1)) {
      /* IPv6-piece-leading-zero */
    }
    pieces[pieceIndex] = value
    pieceIndex++
  }
  if (compress !== null) {
    let swaps = pieceIndex - compress
    pieceIndex = 7
    while (pieceIndex !== 0 && swaps > 0) {
      const tmp = pieces[pieceIndex]
      pieces[pieceIndex] = pieces[compress + swaps - 1]
      pieces[compress + swaps - 1] = tmp
      pieceIndex--
      swaps--
    }
  } else if (compress === null && pieceIndex !== 8) {
    return null
  }
  return pieces
}
function parseOpaqueHost(input: string): string | null {
  for (const ch of input) {
    const cp = ch.codePointAt(0)!
    if (isForbiddenHostCP(cp)) return null
    if (!isURLCP(cp) && cp !== 0x25) return null
  }
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '%' && !(isHex(input.charCodeAt(i + 1)) && isHex(input.charCodeAt(i + 2))))
      return null
  }
  return utf8Pct(input, inC0)
}
function parseHost(input: string, isOpaque: boolean): Host | null {
  if (input[0] === '[') {
    if (input[input.length - 1] !== ']') return null
    const addr = parseIPv6(input.slice(1, -1))
    if (addr === null) return null
    return { kind: 'ipv6', value: addr }
  }
  if (isOpaque) {
    const o = parseOpaqueHost(input)
    return o === null ? null : { kind: 'opaque', value: o }
  }
  if (input === '') return null
  // percent-encoded byte in domain is a validation error but allowed:
  const domain = utf8Decode(percentDecodeBytes(utf8Encode(input)))
  const ascii = domainToASCII(domain)
  if (ascii === null) return null
  if (endsInNumber(ascii)) {
    const ipv4 = parseIPv4(ascii)
    if (ipv4 === null) return null
    return { kind: 'ipv4', value: ipv4 }
  }
  return { kind: 'domain', value: ascii }
}

// ---- URL record ----
export interface URLRecord {
  scheme: string
  username: string
  password: string
  host: Host
  port: number | null
  path: string[] | string // string => opaque path
  query: string | null
  fragment: string | null
}

function newURLRecord(): URLRecord {
  return {
    scheme: '',
    username: '',
    password: '',
    host: { kind: 'none' },
    port: null,
    path: [],
    query: null,
    fragment: null,
  }
}

const DEFAULT_PORTS: Record<string, number> = {
  ftp: 21,
  file: null as unknown as number,
  http: 80,
  https: 443,
  ws: 80,
  wss: 443,
}
const SPECIAL_SCHEMES = new Set(['ftp', 'file', 'http', 'https', 'ws', 'wss'])
function isSpecial(scheme: string): boolean {
  return SPECIAL_SCHEMES.has(scheme)
}
function defaultPort(scheme: string): number | null {
  return scheme in DEFAULT_PORTS ? DEFAULT_PORTS[scheme] : null
}
function cannotHaveUserPwdPort(rec: URLRecord): boolean {
  return rec.host.kind === 'none' || rec.host.kind === 'empty' || rec.scheme === 'file'
}

function serializeIPv4(n: number): string {
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`
}
function findCompressed(pieces: number[]): number | null {
  let longest = null,
    longestSize = 1,
    found = null,
    foundSize = 0
  for (let i = 0; i < 8; i++) {
    if (pieces[i] !== 0) {
      if (foundSize > longestSize) {
        longest = found
        longestSize = foundSize
      }
      found = null
      foundSize = 0
    } else {
      if (found === null) found = i
      foundSize++
    }
  }
  if (foundSize > longestSize) return found
  return longest
}
function serializeIPv6(pieces: number[]): string {
  let out = ''
  const compress = findCompressed(pieces)
  let ignore0 = false
  for (let i = 0; i < 8; i++) {
    if (ignore0 && pieces[i] === 0) continue
    if (ignore0) ignore0 = false
    if (i === compress) {
      out += i === 0 ? '::' : ':'
      ignore0 = true
      continue
    }
    out += pieces[i].toString(16).toLowerCase()
    if (i !== 7) out += ':'
  }
  return out
}
function serializeHost(host: Host): string {
  if (host.kind === 'ipv4') return serializeIPv4(host.value)
  if (host.kind === 'ipv6') return `[${serializeIPv6(host.value)}]`
  if (host.kind === 'domain' || host.kind === 'opaque') return host.value
  return '' // empty / none
}

function shortenPath(rec: URLRecord): void {
  if (rec.path === '' || !Array.isArray(rec.path)) return
  if (rec.scheme === 'file' && rec.path.length === 1 && isWindowsDriveLetter(rec.path[0])) return
  if (rec.path.length > 0) rec.path.pop()
}

// Windows drive letter: two code points, first ASCII alpha, second ':' or '|'.
function isWindowsDriveLetter(seg: string): boolean {
  if (seg.length < 2) return false
  const a = seg.codePointAt(0)!,
    b = seg.codePointAt(1)!
  return isAlpha(a) && (b === 0x3a || b === 0x7c)
}
function startsWithWindowsDriveLetter(s: string): boolean {
  if (s.length < 2) return false
  const a = s.codePointAt(0)!,
    b = s.codePointAt(1)!
  if (!isAlpha(a) || !(b === 0x3a || b === 0x7c)) return false
  if (s.length === 2) return true
  const d = s.codePointAt(2)!
  return d === 0x2f || d === 0x5c || d === 0x3f || d === 0x23
}

// ---- basic URL parser ----
type State =
  | 'scheme start'
  | 'scheme'
  | 'no scheme'
  | 'special relative or authority'
  | 'path or authority'
  | 'relative'
  | 'relative slash'
  | 'authority'
  | 'host'
  | 'hostname'
  | 'port'
  | 'file'
  | 'file slash'
  | 'file host'
  | 'path start'
  | 'path'
  | 'opaque path'
  | 'query'
  | 'fragment'
  | 'special authority slashes'
  | 'special authority ignore slashes'

function basicURLParser(
  input: string,
  base: URLRecord | null,
  url: URLRecord | null,
  stateOverride: State | null,
): URLRecord | null {
  input = String(input)
  if (url === null) {
    const rec = newURLRecord()
    const cps = [...input]
    let start = 0,
      endp = cps.length
    while (start < endp && isC0OrSpace(cps[start].codePointAt(0)!)) start++
    while (endp > start && isC0OrSpace(cps[endp - 1].codePointAt(0)!)) endp--
    input = cps.slice(start, endp).join('')
    url = rec
  }
  // remove ASCII tab / LF / CR
  input = [...input]
    .filter(ch => {
      const d = ch.codePointAt(0)!
      return d !== 0x09 && d !== 0x0a && d !== 0x0d
    })
    .join('')

  const cps = [...input]
  const len = cps.length
  // `remaining` is the substring from pointer (inclusive), matching the spec.
  const remaining = (p: number) => cps.slice(Math.max(0, p)).join('')
  let state: State = stateOverride ?? 'scheme start'
  let buffer = ''
  let atSignSeen = false,
    insideBrackets = false,
    passwordTokenSeen = false
  let pointer = 0

  const FAIL = null

  while (true) {
    const c = pointer >= len ? null : cps[pointer]
    const cp = c === null ? -1 : c.codePointAt(0)!

    switch (state) {
      case 'scheme start': {
        if (c !== null && isAlpha(cp)) {
          buffer += String.fromCodePoint(cp).toLowerCase()
          state = 'scheme'
        } else if (stateOverride === null) {
          state = 'no scheme'
          pointer--
        } else return FAIL
        break
      }
      case 'scheme': {
        if (c !== null && (isAlnum(cp) || cp === 0x2b || cp === 0x2d || cp === 0x2e)) {
          buffer += String.fromCodePoint(cp).toLowerCase()
        } else if (cp === 0x3a) {
          if (stateOverride !== null) {
            if (isSpecial(url!.scheme) && !isSpecial(buffer)) return url // no-op
            if (!isSpecial(url!.scheme) && isSpecial(buffer)) return url
            if (
              (url!.username !== '' || url!.password !== '' || url!.port !== null) &&
              buffer === 'file'
            )
              return url
            if (url!.scheme === 'file' && url!.host.kind === 'empty') return url
          }
          url!.scheme = buffer
          if (stateOverride !== null) {
            if (url!.port === defaultPort(url!.scheme)) url!.port = null
            return url
          }
          buffer = ''
          if (url!.scheme === 'file') {
            if (!(cps[pointer + 1] === '/' && cps[pointer + 2] === '/')) {
              /* validation error */
            }
            state = 'file'
          } else if (isSpecial(url!.scheme)) {
            if (base !== null && base.scheme === url!.scheme)
              state = 'special relative or authority'
            else state = 'special authority slashes'
          } else if (cps[pointer + 1] === '/') {
            state = 'path or authority'
            pointer++
          } else {
            url!.path = ''
            state = 'opaque path'
          }
        } else if (stateOverride === null) {
          buffer = ''
          state = 'no scheme'
          pointer = -1
        } else return FAIL
        break
      }
      case 'no scheme': {
        const baseOpaque = base !== null && !Array.isArray(base.path)
        if (base === null || (baseOpaque && cp !== 0x23)) return FAIL
        if (baseOpaque && cp === 0x23) {
          url!.scheme = base!.scheme
          url!.path = base!.path
          url!.query = base!.query
          url!.fragment = ''
          state = 'fragment'
        } else if (base!.scheme !== 'file') {
          state = 'relative'
          pointer--
        } else {
          state = 'file'
          pointer--
        }
        break
      }
      case 'special relative or authority': {
        if (cp === 0x2f && remaining(pointer).startsWith('//')) {
          state = 'special authority ignore slashes'
          pointer++
        } else {
          /* validation error */ state = 'relative'
          pointer--
        }
        break
      }
      case 'path or authority': {
        if (cp === 0x2f) state = 'authority'
        else {
          state = 'path'
          pointer--
        }
        break
      }
      case 'relative': {
        url!.scheme = base!.scheme
        if (cp === 0x2f) state = 'relative slash'
        else if (isSpecial(url!.scheme) && cp === 0x5c) {
          /* validation error */ state = 'relative slash'
        } else {
          url!.username = base!.username
          url!.password = base!.password
          url!.host = base!.host
          url!.port = base!.port
          url!.path = Array.isArray(base!.path) ? [...base!.path] : []
          url!.query = base!.query
          if (cp === 0x3f) {
            url!.query = ''
            state = 'query'
          } else if (cp === 0x23) {
            url!.fragment = ''
            state = 'fragment'
          } else if (c !== null) {
            url!.query = null
            shortenPath(url!)
            state = 'path'
            pointer--
          }
        }
        break
      }
      case 'relative slash': {
        if (isSpecial(url!.scheme) && (cp === 0x2f || cp === 0x5c)) {
          if (cp === 0x5c) {
            /* validation error */
          }
          state = 'special authority ignore slashes'
        } else if (cp === 0x2f) state = 'authority'
        else {
          url!.username = base!.username
          url!.password = base!.password
          url!.host = base!.host
          url!.port = base!.port
          state = 'path'
          pointer--
        }
        break
      }
      case 'special authority slashes': {
        if (cp === 0x2f && remaining(pointer).startsWith('//')) {
          state = 'special authority ignore slashes'
          pointer++
        } else {
          /* validation error */ state = 'special authority ignore slashes'
          pointer--
        }
        break
      }
      case 'special authority ignore slashes': {
        if (cp !== 0x2f && cp !== 0x5c) {
          state = 'authority'
          pointer--
        } else {
          /* validation error */
        }
        break
      }
      case 'authority': {
        if (cp === 0x40) {
          if (atSignSeen) buffer = `%40${buffer}`
          atSignSeen = true
          for (const ch of buffer) {
            const ccp = ch.codePointAt(0)!
            if (ccp === 0x3a && !passwordTokenSeen) {
              passwordTokenSeen = true
              continue
            }
            if (passwordTokenSeen) url!.password += utf8Pct(ch, inUser)
            else url!.username += utf8Pct(ch, inUser)
          }
          buffer = ''
        } else if (
          c === null ||
          cp === 0x2f ||
          cp === 0x3f ||
          cp === 0x23 ||
          (isSpecial(url!.scheme) && cp === 0x5c)
        ) {
          if (atSignSeen && buffer === '') return FAIL
          pointer -= [...buffer].length + 1
          buffer = ''
          state = 'host'
        } else buffer += c
        break
      }
      case 'host':
      case 'hostname': {
        if (stateOverride === 'host' && url!.scheme === 'file') {
          pointer--
          state = 'file host'
          break
        }
        if (cp === 0x3a && !insideBrackets) {
          if (buffer === '') return FAIL
          if (stateOverride === 'hostname') return FAIL
          const h = parseHost(buffer, !isSpecial(url!.scheme) && url!.scheme !== '')
          if (h === null) return FAIL
          url!.host = h
          buffer = ''
          state = 'port'
        } else if (
          c === null ||
          cp === 0x2f ||
          cp === 0x3f ||
          cp === 0x23 ||
          (isSpecial(url!.scheme) && cp === 0x5c)
        ) {
          pointer--
          if (url!.host.kind === 'none' && buffer === '') {
            if (base !== null && base.host.kind !== 'none') {
              // host elided; inherit from base at the end of parsing
              buffer = ''
              state = 'path start'
              if (stateOverride !== null) return url
              break
            }
            if (!isSpecial(url!.scheme) || url!.scheme === 'file') return FAIL
          }
          if (
            stateOverride !== null &&
            buffer === '' &&
            (url!.username !== '' || url!.password !== '' || url!.port !== null)
          )
            return FAIL
          const h = parseHost(buffer, !isSpecial(url!.scheme) && url!.scheme !== '')
          if (h === null) return FAIL
          url!.host = h
          buffer = ''
          state = 'path start'
          if (stateOverride !== null) return url
        } else {
          if (cp === 0x5b) insideBrackets = true
          else if (cp === 0x5d) insideBrackets = false
          buffer += c
        }
        break
      }
      case 'port': {
        if (isDigit(cp)) buffer += String.fromCodePoint(cp)
        else if (
          c === null ||
          cp === 0x2f ||
          cp === 0x3f ||
          cp === 0x23 ||
          (isSpecial(url!.scheme) && cp === 0x5c) ||
          stateOverride !== null
        ) {
          if (buffer !== '') {
            const port = parseInt(buffer, 10)
            if (Number.isNaN(port) || port > 65535) return FAIL // out of range
            url!.port = port === defaultPort(url!.scheme) ? null : port
            buffer = ''
            if (stateOverride !== null) return url
          } else if (stateOverride !== null) return FAIL
          state = 'path start'
          pointer--
        } else return FAIL
        break
      }
      case 'file': {
        url!.scheme = 'file'
        url!.host = { kind: 'empty' }
        if (cp === 0x2f || cp === 0x5c) {
          if (cp === 0x5c) {
            /* validation error */
          }
          state = 'file slash'
        } else if (base !== null && base.scheme === 'file') {
          url!.host = base.host
          url!.path = Array.isArray(base.path) ? [...base.path] : []
          url!.query = base.query
          if (cp === 0x3f) {
            url!.query = ''
            state = 'query'
          } else if (cp === 0x23) {
            url!.fragment = ''
            state = 'fragment'
          } else if (c !== null) {
            url!.query = null
            if (!startsWithWindowsDriveLetter(remaining(pointer))) shortenPath(url!)
            else {
              /* validation error */ url!.path = []
            }
            state = 'path'
            pointer--
          }
        } else {
          state = 'path'
          pointer--
        }
        break
      }
      case 'file slash': {
        if (cp === 0x2f || cp === 0x5c) {
          if (cp === 0x5c) {
            /* validation error */
          }
          state = 'file host'
        } else {
          if (base !== null && base.scheme === 'file') {
            url!.host = base.host
            if (
              !startsWithWindowsDriveLetter(remaining(pointer)) &&
              Array.isArray(base.path) &&
              base.path[0] !== undefined &&
              isWindowsDriveLetter(base.path[0])
            ) {
              if (Array.isArray(url!.path)) url!.path.push(base.path[0])
            }
          }
          state = 'path'
          pointer--
        }
        break
      }
      case 'file host': {
        if (c === null || cp === 0x2f || cp === 0x5c || cp === 0x3f || cp === 0x23) {
          pointer--
          if (stateOverride === null && isWindowsDriveLetter(buffer)) {
            /* validation error */ state = 'path'
          } else if (buffer === '') {
            url!.host = { kind: 'empty' }
            if (stateOverride !== null) return url
            state = 'path start'
          } else {
            let h = parseHost(buffer, false)
            if (h === null) return FAIL
            if (h.kind === 'domain' && h.value === 'localhost') h = { kind: 'empty' }
            url!.host = h
            if (stateOverride !== null) return url
            buffer = ''
            state = 'path start'
          }
        } else buffer += c
        break
      }
      case 'path start': {
        if (isSpecial(url!.scheme)) {
          if (cp === 0x5c) {
            /* validation error */
          }
          state = 'path'
          if (cp !== 0x2f && cp !== 0x5c) pointer--
        } else if (stateOverride === null && cp === 0x3f) {
          url!.query = ''
          state = 'query'
        } else if (stateOverride === null && cp === 0x23) {
          url!.fragment = ''
          state = 'fragment'
        } else if (c !== null) {
          state = 'path'
          if (cp !== 0x2f) pointer--
        } else if (stateOverride !== null && url!.host.kind === 'none') {
          url!.path = ['']
        }
        break
      }
      case 'path': {
        if (
          c === null ||
          cp === 0x2f ||
          (isSpecial(url!.scheme) && cp === 0x5c) ||
          (stateOverride === null && (cp === 0x3f || cp === 0x23))
        ) {
          if (isSpecial(url!.scheme) && cp === 0x5c) {
            /* validation error */
          }
          if (buffer === '..') {
            shortenPath(url!)
            if (cp !== 0x2f && !(isSpecial(url!.scheme) && cp === 0x5c)) {
              if (Array.isArray(url!.path)) url!.path.push('')
            }
          } else if (buffer === '.') {
            if (cp !== 0x2f && !(isSpecial(url!.scheme) && cp === 0x5c)) {
              if (Array.isArray(url!.path)) url!.path.push('')
            }
          } else {
            if (
              url!.scheme === 'file' &&
              Array.isArray(url!.path) &&
              url!.path.length === 0 &&
              isWindowsDriveLetter(buffer)
            ) {
              buffer = `${buffer[0]}:${buffer.slice(2)}`
            }
            if (Array.isArray(url!.path)) url!.path.push(buffer)
          }
          buffer = ''
          if (cp === 0x3f) {
            url!.query = ''
            state = 'query'
          } else if (cp === 0x23) {
            url!.fragment = ''
            state = 'fragment'
          }
        } else {
          if (!isURLCP(cp) && cp !== 0x25) {
            /* validation error */
          }
          if (cp === 0x25 && !(hexAt(cps, pointer + 1) && hexAt(cps, pointer + 2))) {
            /* validation error */
          }
          buffer += utf8Pct(c!, inPath)
        }
        break
      }
      case 'opaque path': {
        if (cp === 0x3f) {
          url!.path = buffer
          url!.query = ''
          state = 'query'
        } else if (cp === 0x23) {
          url!.path = buffer
          url!.fragment = ''
          state = 'fragment'
        } else if (cp === 0x20) {
          const nxt = cps.slice(pointer + 1).join('')
          if (nxt.startsWith('?') || nxt.startsWith('#')) buffer += '%20'
          else buffer += ' '
        } else if (c !== null) {
          if (!isURLCP(cp) && cp !== 0x25) {
            /* validation error */
          }
          if (cp === 0x25 && !(hexAt(cps, pointer + 1) && hexAt(cps, pointer + 2))) {
            /* validation error */
          }
          buffer += utf8Pct(c!, inC0)
        }
        if (c === null) {
          url!.path = buffer
        }
        break
      }
      case 'query': {
        const set = isSpecial(url!.scheme) ? inSQuery : inQuery
        if (stateOverride === null && cp === 0x23) {
          url!.query = (url!.query ?? '') + utf8Pct(buffer, set)
          buffer = ''
          url!.fragment = ''
          state = 'fragment'
        } else if (c !== null && cp !== 0x23) {
          if (!isURLCP(cp) && cp !== 0x25) {
            /* validation error */
          }
          if (cp === 0x25 && !(hexAt(cps, pointer + 1) && hexAt(cps, pointer + 2))) {
            /* validation error */
          }
          buffer += c
        } else {
          url!.query = (url!.query ?? '') + utf8Pct(buffer, set)
          buffer = ''
          if (cp === 0x23) {
            url!.fragment = ''
            state = 'fragment'
          }
        }
        break
      }
      case 'fragment': {
        if (c !== null) {
          if (!isURLCP(cp) && cp !== 0x25) {
            /* validation error */
          }
          if (cp === 0x25 && !(hexAt(cps, pointer + 1) && hexAt(cps, pointer + 2))) {
            /* validation error */
          }
          url!.fragment = (url!.fragment ?? '') + utf8Pct(c!, inFrag)
        }
        break
      }
    }

    if (pointer >= len) break
    pointer++
  }

  // Inherit host/username/password/port (and opaque path) from base when the
  // authority was elided, per WHATWG "If url's host is null" step.
  if (url!.host.kind === 'none' && base !== null && base.host.kind !== 'none') {
    url!.username = base.username
    url!.password = base.password
    url!.host = base.host
    url!.port = base.port
    if (!Array.isArray(url!.path) && base.path !== '') url!.path = base.path
  }

  return url!
}

// ---- serialization ----
function serializePath(url: URLRecord): string {
  if (!Array.isArray(url.path)) return url.path // opaque
  let out = ''
  for (const seg of url.path) out += `/${seg}`
  return out
}
export function serializeURL(rec: URLRecord, excludeFragment = false): string {
  let out = `${rec.scheme}:`
  if (rec.host.kind !== 'none') {
    out += '//'
    if (rec.username !== '' || rec.password !== '') {
      out += rec.username
      if (rec.password !== '') out += `:${rec.password}`
      out += '@'
    }
    out += serializeHost(rec.host)
    if (rec.port !== null) out += `:${rec.port}`
  } else if (
    rec.path === '' ||
    (Array.isArray(rec.path) && rec.path.length > 1 && rec.path[0] === '')
  ) {
    // empty-host relative-path guard
    if (!Array.isArray(rec.path) || rec.path.length > 1) {
      if (Array.isArray(rec.path) && rec.path[0] === '') {
        out += '/.'
      }
    }
  }
  // the spec's weird step 3: if host null, not opaque, path size>1 and path[0]=='' => append "/."
  if (
    rec.host.kind === 'none' &&
    Array.isArray(rec.path) &&
    rec.path.length > 1 &&
    rec.path[0] === ''
  ) {
    out += '/.'
  }
  out += serializePath(rec)
  if (rec.query !== null) out += `?${rec.query}`
  if (!excludeFragment && rec.fragment !== null) out += `#${rec.fragment}`
  return out
}

export function serializeOrigin(rec: URLRecord): string | null {
  switch (rec.scheme) {
    case 'blob': {
      if (rec.host.kind !== 'none') {
        const inner = basicURLParser(serializePath(rec), null, null, null)
        if (
          inner !== null &&
          (inner.scheme === 'http' || inner.scheme === 'https' || inner.scheme === 'file')
        ) {
          return serializeOrigin(inner)
        }
      }
      return null // opaque origin -> null (we represent opaque as null)
    }
    case 'ftp':
    case 'http':
    case 'https':
    case 'ws':
    case 'wss': {
      const host = serializeHost(rec.host)
      return `${rec.scheme}://${host}${rec.port !== null ? `:${rec.port}` : ''}`
    }
    case 'file':
      return 'file://'
    default:
      return null // opaque origin
  }
}

// ---- URLSearchParams ----
type Tuple = [string, string]

export class URLSearchParams {
  list: Tuple[] = []
  private urlObj: URL | null = null

  constructor(init?: string | string[][] | Record<string, string> | Iterable<[string, string]>) {
    if (typeof init === 'string') {
      let s = init
      if (s[0] === '?') s = s.slice(1)
      this.list = parseFormString(s)
    } else if (Array.isArray(init)) {
      for (const inner of init) {
        if (inner.length !== 2) throw new TypeError('Each tuple must have exactly two elements')
        this.list.push([String(inner[0]), String(inner[1])])
      }
    } else if (init && typeof init === 'object') {
      // record (or any iterable of pairs)
      if (typeof (init as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function') {
        for (const pair of init as Iterable<[string, string]>) {
          const arr = [...pair]
          if (arr.length !== 2) throw new TypeError('Each tuple must have exactly two elements')
          this.list.push([String(arr[0]), String(arr[1])])
        }
      } else {
        for (const key of Object.keys(init)) {
          this.list.push([key, String((init as Record<string, string>)[key])])
        }
      }
    }
  }

  initialize(
    init: string | string[][] | Record<string, string> | Iterable<[string, string]>,
  ): void {
    if (Array.isArray(init)) {
      for (const inner of init) {
        if (inner.length !== 2) throw new TypeError('Each tuple must have exactly two elements')
        this.list.push([String(inner[0]), String(inner[1])])
      }
    } else if (
      init &&
      typeof init === 'object' &&
      typeof (init as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function'
    ) {
      for (const pair of init as Iterable<[string, string]>) {
        const arr = [...pair]
        if (arr.length !== 2) throw new TypeError('Each tuple must have exactly two elements')
        this.list.push([String(arr[0]), String(arr[1])])
      }
    } else {
      this.list = parseFormString(String(init ?? ''))
    }
  }

  private update(): void {
    if (this.urlObj === null) return
    const s = serializeFormList(this.list)
    this.urlObj.url.query = s === '' ? null : s
  }

  get size(): number {
    return this.list.length
  }

  append(name: string, value: string): void {
    this.list.push([String(name), String(value)])
    this.update()
  }
  delete(name: string, value?: string): void {
    if (value !== undefined) {
      this.list = this.list.filter(t => !(t[0] === name && t[1] === value))
    } else {
      this.list = this.list.filter(t => t[0] !== name)
    }
    this.update()
  }
  get(name: string): string | null {
    const t = this.list.find(x => x[0] === name)
    return t ? t[1] : null
  }
  getAll(name: string): string[] {
    return this.list.filter(x => x[0] === name).map(x => x[1])
  }
  has(name: string, value?: string): boolean {
    return value !== undefined
      ? this.list.some(t => t[0] === name && t[1] === value)
      : this.list.some(t => t[0] === name)
  }
  set(name: string, value: string): void {
    const n = String(name),
      v = String(value)
    let found = false
    this.list = this.list.filter(t => {
      if (t[0] !== n) return true
      if (!found) {
        found = true
        t[1] = v
        return true
      }
      return false
    })
    if (!found) this.list.push([n, v])
    this.update()
  }
  sort(): void {
    this.list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    this.update()
  }

  keys(): IterableIterator<string> {
    return this.list.map(t => t[0])[Symbol.iterator]()
  }
  values(): IterableIterator<string> {
    return this.list.map(t => t[1])[Symbol.iterator]()
  }
  entries(): IterableIterator<[string, string]> {
    return this.list.map(t => [t[0], t[1]] as [string, string])[Symbol.iterator]()
  }
  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries()
  }
  forEach(
    cb: (value: string, name: string, self: URLSearchParams) => void,
    thisArg?: unknown,
  ): void {
    for (const [k, v] of this.list) cb.call(thisArg, v, k, this)
  }

  toString(): string {
    return serializeFormList(this.list)
  }
}

// application/x-www-form-urlencoded parser (operates on a string -> bytes).
function parseFormString(input: string): Tuple[] {
  const bytes = utf8Encode(input)
  const sequences = splitBytes(bytes, 0x26)
  const output: Tuple[] = []
  for (const seq of sequences) {
    if (seq.length === 0) continue
    let nameBytes: Uint8Array, valueBytes: Uint8Array
    const eq = seq.indexOf(0x3d)
    if (eq === -1) {
      nameBytes = seq
      valueBytes = new Uint8Array(0)
    } else {
      nameBytes = seq.slice(0, eq)
      valueBytes = seq.slice(eq + 1)
    }
    nameBytes = replacePlus(nameBytes)
    valueBytes = replacePlus(valueBytes)
    const nameStr = utf8Decode(percentDecodeBytes(nameBytes))
    const valueStr = utf8Decode(percentDecodeBytes(valueBytes))
    output.push([nameStr, valueStr])
  }
  return output
}
function splitBytes(bytes: Uint8Array, sep: number): Uint8Array[] {
  const out: Uint8Array[] = []
  let start = 0
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === sep) {
      out.push(bytes.slice(start, i))
      start = i + 1
    }
  }
  out.push(bytes.slice(start))
  return out
}
function replacePlus(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes.map(b => (b === 0x2b ? 0x20 : b)))
}
function serializeFormList(list: Tuple[]): string {
  let out = ''
  let first = true
  for (const [name, value] of list) {
    if (!first) out += '&'
    first = false
    out += `${formPct(name)}=${formPct(value)}`
  }
  return out
}

// ---- URL ----
export class URL {
  url: URLRecord
  private queryObj: URLSearchParams

  constructor(url: string, base?: string | URL) {
    const baseRec = base === undefined ? null : parseBase(base)
    if (baseRec === null && base !== undefined) throw new TypeError('Invalid base URL')
    const parsed = basicURLParser(url, baseRec, null, null)
    if (parsed === null) throw new TypeError('Invalid URL')
    this.url = parsed
    const query = this.url.query ?? ''
    this.queryObj = new URLSearchParams()
    this.queryObj.initialize(query)
    ;(this.queryObj as unknown as { urlObj: URL }).urlObj = this
  }

  get href(): string {
    return serializeURL(this.url)
  }
  set href(v: string) {
    const parsed = basicURLParser(v, null, null, null)
    if (parsed === null) throw new TypeError('Invalid URL')
    this.url = parsed
    this.queryObj.list = []
    const q = this.url.query
    this.queryObj.list = q === null ? [] : parseFormString(q)
  }

  get origin(): string {
    const o = serializeOrigin(this.url)
    return o ?? 'null'
  }

  get protocol(): string {
    return `${this.url.scheme}:`
  }
  set protocol(v: string) {
    basicURLParser(`${v}:`, null, this.url, 'scheme start')
  }

  get username(): string {
    return this.url.username
  }
  set username(v: string) {
    if (cannotHaveUserPwdPort(this.url)) return
    this.url.username = utf8Pct(v, inUser)
  }
  get password(): string {
    return this.url.password
  }
  set password(v: string) {
    if (cannotHaveUserPwdPort(this.url)) return
    this.url.password = utf8Pct(v, inUser)
  }

  get host(): string {
    if (this.url.host.kind === 'none') return ''
    if (this.url.port === null) return serializeHost(this.url.host)
    return `${serializeHost(this.url.host)}:${this.url.port}`
  }
  set host(v: string) {
    if (!Array.isArray(this.url.path)) return // opaque path
    basicURLParser(v, null, this.url, 'host')
  }

  get hostname(): string {
    if (this.url.host.kind === 'none') return ''
    return serializeHost(this.url.host)
  }
  set hostname(v: string) {
    if (!Array.isArray(this.url.path)) return // opaque path
    basicURLParser(v, null, this.url, 'hostname')
  }

  get port(): string {
    return this.url.port === null ? '' : String(this.url.port)
  }
  set port(v: string) {
    if (cannotHaveUserPwdPort(this.url)) return
    if (v === '') {
      this.url.port = null
      return
    }
    basicURLParser(v, null, this.url, 'port')
  }

  get pathname(): string {
    return serializePath(this.url)
  }
  set pathname(v: string) {
    if (!Array.isArray(this.url.path)) return // opaque path
    this.url.path = []
    basicURLParser(v, null, this.url, 'path start')
  }

  get search(): string {
    return this.url.query === null || this.url.query === '' ? '' : `?${this.url.query}`
  }
  set search(v: string) {
    if (v === '') {
      this.url.query = null
      this.queryObj.list = []
      return
    }
    const input = v[0] === '?' ? v.slice(1) : v
    this.url.query = ''
    basicURLParser(input, null, this.url, 'query')
    this.queryObj.list = parseFormString(input)
  }

  get searchParams(): URLSearchParams {
    return this.queryObj
  }

  get hash(): string {
    return this.url.fragment === null || this.url.fragment === '' ? '' : `#${this.url.fragment}`
  }
  set hash(v: string) {
    if (v === '') {
      this.url.fragment = null
      return
    }
    const input = v[0] === '#' ? v.slice(1) : v
    this.url.fragment = ''
    basicURLParser(input, null, this.url, 'fragment')
  }

  toString(): string {
    return serializeURL(this.url)
  }
  toJSON(): string {
    return serializeURL(this.url)
  }

  static parse(url: string, base?: string | URL): URL | null {
    const baseRec = base === undefined ? null : parseBase(base)
    if (base !== undefined && baseRec === null) return null
    const parsed = basicURLParser(url, baseRec, null, null)
    if (parsed === null) return null
    const result = Object.create(URL.prototype) as URL
    result.url = parsed
    const q = parsed.query ?? ''
    result.queryObj = new URLSearchParams()
    result.queryObj.initialize(q)
    ;(result.queryObj as unknown as { urlObj: URL }).urlObj = result
    return result
  }

  static canParse(url: string, base?: string | URL): boolean {
    const baseRec = base === undefined ? null : parseBase(base)
    if (base !== undefined && baseRec === null) return false
    return basicURLParser(url, baseRec, null, null) !== null
  }
}

function parseBase(base: string | URL): URLRecord | null {
  if (typeof base === 'string') {
    return basicURLParser(base, null, null, null)
  }
  return base.url
}
