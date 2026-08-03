/*
 * @blyou/whatwg-url — a zero-dependency, WHATWG URL & URLSearchParams
 * implementation for DOM-less ES2023 environments.
 * Follows https://url.spec.whatwg.org/ .
 */

const nativeParseInt = parseInt
const nativeNumberIsNaN = Number.isNaN
const nativeString = String
const nativeStringFromCharCode = nativeString.fromCharCode
const nativeStringFromCodePoint = nativeString.fromCodePoint
const nativeArrayIsArray = Array.isArray
const nativeMath = Math
const nativeMathMax = nativeMath.max
const nativeMathFloor = nativeMath.floor
const nativeMathPow = nativeMath.pow
const nativeUint8Array = Uint8Array

// Pure-JS UTF-8 codec (no TextEncoder/TextDecoder) so this works in runtimes
// that lack those globals (e.g. mini-program environments). The decode is
// lenient, matching `new TextDecoder('utf-8', { fatal: false })`.
const utf8Encode = (s: string): Uint8Array => {
  const out: number[] = []
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x80) out.push(cp)
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    else if (cp < 0x10000)
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      )
  }
  return nativeUint8Array.from(out)
}
const utf8Decode = (b: Uint8Array): string => {
  let s = ''
  let i = 0
  while (i < b.length) {
    const c = b[i++]
    if (c < 0x80) s += nativeString.fromCodePoint(c)
    else if (c < 0xc0)
      s += '\uFFFD' // invalid continuation / lone byte
    else if (c < 0xe0) {
      const c2 = i < b.length ? b[i++] : 0
      s +=
        i > 0 && (c2 & 0xc0) === 0x80
          ? nativeString.fromCodePoint(((c & 0x1f) << 6) | (c2 & 0x3f))
          : '\uFFFD'
    } else if (c < 0xf0) {
      const c2 = i < b.length ? b[i++] : 0
      const c3 = i < b.length ? b[i++] : 0
      if ((c2 & 0xc0) === 0x80 && (c3 & 0xc0) === 0x80)
        s += nativeString.fromCodePoint(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f))
      else {
        s += '\uFFFD'
        i--
      } // back off consumed bytes on malformed sequence
    } else if (c < 0xf8) {
      const c2 = i < b.length ? b[i++] : 0
      const c3 = i < b.length ? b[i++] : 0
      const c4 = i < b.length ? b[i++] : 0
      if ((c2 & 0xc0) === 0x80 && (c3 & 0xc0) === 0x80 && (c4 & 0xc0) === 0x80) {
        s += nativeString.fromCodePoint(
          ((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f),
        )
      } else {
        s += '\uFFFD'
        i--
      }
    } else s += '\uFFFD' // invalid leading byte (>= 0xf8)
  }
  return s
}

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
const isForbiddenHostCP = (cp: number) =>
  cp == 0x00 ||
  cp == 0x09 ||
  cp == 0x0a ||
  cp == 0x0d ||
  cp == 0x20 ||
  cp == 0x23 ||
  cp == 0x2f ||
  cp == 0x3a ||
  cp == 0x3c ||
  cp == 0x3e ||
  cp == 0x3f ||
  cp == 0x40 ||
  cp == 0x5b ||
  cp == 0x5c ||
  cp == 0x5d ||
  cp == 0x5e ||
  cp == 0x7c

// UTS46 "disallowed" code points (whitespace/controls) that are rejected in a
// domain even before any mapping: C0/C1 controls and IDNA-illegal white space.
const isIdnaDisallowed = (cp: number): boolean => {
  if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)) return true // C0/C1 controls
  if (
    cp == 0x00a0 || // NO-BREAK SPACE
    cp == 0x1680 || // OGHAM SPACE MARK
    (cp >= 0x2000 && cp <= 0x200a) || // EN QUAD … HAIR SPACE
    cp == 0x2028 || // LINE SEPARATOR
    cp == 0x2029 || // PARAGRAPH SEPARATOR
    cp == 0x202f || // NARROW NO-BREAK SPACE
    cp == 0x205f || // MEDIUM MATHEMATICAL SPACE
    cp == 0x3000 || // IDEOGRAPHIC SPACE
    cp == 0xfeff // ZERO WIDTH NO-BREAK SPACE
  )
    return true
  if (
    cp == 0x0378 || // 𐎸? reserved (unassigned, disallowed)
    cp == 0x05be || // HEBREW PUNCTUATION MAQAF
    cp == 0x06dd || // ARABIC END OF AYAH
    cp == 0x2025 || // TWO DOT LEADER
    cp == 0x2a74 || // DOUBLE COLON EQUAL
    cp == 0x2ff0 || // IDEOGRAPHIC DESCRIPTION CHARACTER (and U+2FF1 too)
    cp == 0x2ff1 ||
    cp == 0xfffa || // ￺ reserved
    cp == 0xfffb // ￻ reserved
  )
    return true
  if (cp >= 0xe0000 && cp <= 0xe0fff) return true // LANGUAGE TAG (rejected)
  return false
}

// Targeted UTS46 single-code-point mappings for the cases the lightweight
// library must handle. The capital sharp S folds to "ß" so it punycode-
// encodes consistently. Note: ≠/≮/≯ are intentionally NOT mapped here —
// WHATWG's domainToASCII leaves them as non-ASCII code points that are
// punycode-encoded directly (yielding xn--1ch / xn--gdh / xn--hdh), rather
// than being folded to ASCII punctuation first.
const uts46SingleMap = (cp: number): string | null => {
  switch (cp) {
    case 0x1e9e:
      return 'ß' // ẞ CAPITAL SHARP S → ß (then punycode-encoded)
    default:
      return null
  }
}

// UTS46 "mapped to nothing" code points: removed from a domain during IDNA
// processing (per WHATWG URL's domainToASCII). WHATWG uses the non-transitional
// processing, so these are dropped rather than mapped to another character.
const isIdnaMappedToNothing = (cp: number): boolean => {
  if (
    cp == 0x00ad || // SOFT HYPHEN
    cp == 0x034f || // COMBINING GRAPHEME JOINER
    cp == 0x061c || // ARABIC LETTER MARK
    (cp >= 0x115f && cp <= 0x1160) || // HANGUL
    (cp >= 0x17b4 && cp <= 0x17b5) ||
    (cp >= 0x180b && cp <= 0x180d) || // MONGOLIAN FREE VARIATION SELECTOR
    cp == 0x180e || // MONGOLIAN VOWEL SEPARATOR
    cp == 0x200b || // ZERO WIDTH SPACE
    (cp >= 0x200e && cp <= 0x200f) ||
    cp == 0x2060 || // WORD JOINER
    cp == 0x2061 ||
    cp == 0x2062 ||
    cp == 0x2063 ||
    cp == 0x2064 ||
    cp == 0x2065 || // (2066–2069 are kept for the Bidi check below)
    (cp >= 0x206a && cp <= 0x206f) || // other format controls → dropped
    (cp >= 0xfe00 && cp <= 0xfe0f) || // VARIATION SELECTOR
    cp == 0xfeff || // ZERO WIDTH NO-BREAK SPACE
    (cp >= 0xfff0 && cp <= 0xfff8) ||
    (cp >= 0x1d173 && cp <= 0x1d17a) // MUSICAL SYMBOL
  )
    return true
  return false
}

// RFC 5892 CONTEXTJ: a joiner (ZWJ U+200D / ZWNJ U+200C) is kept only inside a
// valid joining context, otherwise it is dropped from the domain.
const VIRAMAS = [
  0x094d, 0x09cd, 0x0a4d, 0x0acd, 0x0b4d, 0x0bcd, 0x0c4d, 0x0ccd, 0x0d4d, 0x0dca, 0x0e3a, 0x0eba,
  0x0f84, 0x1039, 0x1714, 0x1734, 0x17d2, 0x1bac, 0x1bf2, 0x1bfc, 0xa9c0, 0xaac1, 0xabc9, 0xac70,
  0xac71, 0xac72, 0xac73, 0xac74,
]
const isVirama = (cp: number | null): boolean => cp != null && VIRAMAS.includes(cp)
const joinerValid = (cp: number, prev: number | null, next: number | null): boolean => {
  if (cp == 0x200d) return isVirama(prev) // ZWJ valid only after a virama
  if (cp == 0x200c) return prev == 0x0647 && next == 0x0627 // ZWNJ: Arabic Yeh + Alef
  return false
}

// RFC 5893 Bidi rule (used by UTS46's domainToASCII). Each code point is
// classified as R/AL (right-to-left / Arabic letter), AN (Arabic-Indic
// digit), B (Bidi control), or L (everything else, including ASCII letters
// and European digits). A label is valid iff it is purely LTR (Rule 1) or a
// well-formed RTL label (Rule 2: starts and ends with R/AL, contains no L,
// no Bidi controls, but may contain AN/EN).
const bidiClass = (cp: number): 'R' | 'AN' | 'B' | 'N' | 'L' => {
  if (cp == 0x200c || cp == 0x200d) return 'N' // ZWJ/ZWNJ are directionally neutral
  if (
    (cp >= 0x0590 && cp <= 0x05ff) || // Hebrew
    (cp >= 0x0600 && cp <= 0x07bf) || // Arabic, Syriac, Thaana, ...
    (cp >= 0x08a0 && cp <= 0x08ff) || // Arabic Supplement/Extended-A
    (cp >= 0xfb1d && cp <= 0xfdff) || // Hebrew/Arabic presentation forms
    (cp >= 0xfe70 && cp <= 0xfeff) // Arabic presentation forms-B
  )
    return 'R'
  if ((cp >= 0x0660 && cp <= 0x0669) || (cp >= 0x06f0 && cp <= 0x06f9)) return 'AN'
  if ((cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069)) return 'B'
  return 'L'
}
const bidiValid = (label: string): boolean => {
  const cps = [...label].map(c => c.codePointAt(0)!)
  if (cps.length == 0) return true
  let hasR = false,
    hasL = false,
    hasB = false
  for (const cp of cps) {
    const cls = bidiClass(cp)
    if (cls == 'R') hasR = true
    else if (cls == 'L') hasL = true
    else if (cls == 'B') hasB = true
  }
  if (!hasR && !hasB) return true // Rule 1: no RTL directionality → valid
  // Rule 2: must be a well-formed RTL label.
  if (hasB) return false // Bidi controls are not allowed in labels
  if (hasL) return false // an RTL label must not contain L characters
  if (bidiClass(cps[0]) != 'R' || bidiClass(cps[cps.length - 1]) != 'R') return false
  return true
}

// ---- percent-encoding sets ----
const inC0 = (cp: number) => (cp >= 0x00 && cp <= 0x1f) || cp > 0x7e
const inFrag = (cp: number) => inC0(cp) || [0x20, 0x22, 0x3c, 0x3e, 0x60].includes(cp)
const inQuery = (cp: number) => inC0(cp) || [0x20, 0x22, 0x23, 0x3c, 0x3e].includes(cp)
const inSQuery = (cp: number) => inQuery(cp) || cp == 0x27
const inPath = (cp: number) => inQuery(cp) || [0x3f, 0x5e, 0x60, 0x7b, 0x7d].includes(cp)
const inUser = (cp: number) =>
  inPath(cp) ||
  cp == 0x2f ||
  cp == 0x3a ||
  cp == 0x3b ||
  cp == 0x3d ||
  cp == 0x40 ||
  (cp >= 0x5b && cp <= 0x5d) ||
  cp == 0x7c
const inForm = (cp: number) => !(isAlnum(cp) || [0x2a, 0x2d, 0x2e, 0x5f].includes(cp))

const pctByte = (b: number) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`

const percentDecodeBytes = (input: Uint8Array): Uint8Array => {
  const out: number[] = []
  for (let i = 0; i < input.length; i++) {
    const b = input[i]
    if (b == 0x25 && i + 2 < input.length && isHex(input[i + 1]) && isHex(input[i + 2])) {
      out.push(nativeParseInt(nativeStringFromCharCode(input[i + 1], input[i + 2]), 16))
      i += 2
    } else out.push(b)
  }
  return nativeUint8Array.from(out)
}

const utf8PctCP = (cp: number, set: (cp: number) => boolean): string => {
  if (!set(cp)) return nativeStringFromCodePoint(cp)
  let out = ''
  for (const b of utf8Encode(nativeStringFromCodePoint(cp))) out += pctByte(b)
  return out
}
const utf8Pct = (s: string, set: (cp: number) => boolean): string => {
  let out = ''
  for (const ch of s) out += utf8PctCP(ch.codePointAt(0)!, set)
  return out
}
//#ifndef PUBLISH
// Exposed for test suites (e.g. WPT percent-encoding.json) that exercise the
// raw percent-encode operation. Only the UTF-8 encoding (path set) is supported.
export const percentEncode = (input: string): string => {
  return utf8Pct(input, inPath)
}
//#endif
const formPct = (s: string): string => {
  let out = ''
  for (const b of utf8Encode(s))
    out += b == 0x20 ? '+' : !inForm(b) ? nativeStringFromCharCode(b) : pctByte(b)
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
const adapt = (delta: number, n: number, first: boolean): number => {
  delta = first ? nativeMathFloor(delta / DAMP) : delta >> 1
  delta += nativeMathFloor(delta / n)
  let k = 0
  while (delta > ((BASE - TMIN) * TMAX) >> 1) {
    delta = nativeMathFloor(delta / (BASE - TMIN))
    k += BASE
  }
  return nativeMathFloor(k + ((BASE - TMIN + 1) * delta) / (delta + SKEW))
}
// Pure-JS RFC 3492 punycode implementation (a self-contained, dependency-free
// port of the canonical punycode.js algorithm). The basic code point set is
// every ASCII code point (< 0x80); all other code points are encoded.
const MAX_INT = 0x7fffffff
const punyDigitToBasic = (digit: number, flag: number): number =>
  digit + 22 + 75 * (digit < 26 ? 1 : 0) - ((flag !== 0 ? 1 : 0) << 5)
const punyBasicToDigit = (cp: number): number => {
  if (cp >= 0x30 && cp < 0x3a) return 26 + (cp - 0x30)
  if (cp >= 0x41 && cp < 0x5b) return cp - 0x41
  if (cp >= 0x61 && cp < 0x7b) return cp - 0x61
  return BASE
}
const punyEncode = (input: string): string => {
  const chars = [...input.toLowerCase()].map(c => c.codePointAt(0)!)
  const inputLength = chars.length
  let n = INIT_N,
    delta = 0,
    bias = INIT_BIAS
  const out: number[] = []
  for (const cp of chars) if (cp < 0x80) out.push(cp)
  const basicLength = out.length
  let handled = basicLength
  if (basicLength > 0) out.push(0x2d)
  while (handled < inputLength) {
    let m = MAX_INT
    for (const cp of chars) if (cp >= n && cp < m) m = cp
    const handledPlusOne = handled + 1
    if (m - n > Math.floor((MAX_INT - delta) / handledPlusOne)) return ''
    delta += (m - n) * handledPlusOne
    n = m
    for (const cp of chars) {
      if (cp < n && ++delta > MAX_INT) return ''
      if (cp == n) {
        let q = delta
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias
          if (q < t) break
          out.push(punyDigitToBasic(t + ((q - t) % (BASE - t)), 0))
          q = nativeMathFloor((q - t) / (BASE - t))
        }
        out.push(punyDigitToBasic(q, 0))
        bias = adapt(delta, handledPlusOne, handled == basicLength)
        delta = 0
        handled++
      }
    }
    delta++
    n++
  }
  return nativeStringFromCharCode(...out)
}
const punyDecode = (input: string): string | null => {
  const chars = [...input]
  const inputLength = chars.length
  let n = INIT_N,
    bias = INIT_BIAS,
    i = 0
  const out: number[] = []
  let basic = chars.lastIndexOf('-')
  if (basic < 0) basic = 0
  for (let j = 0; j < basic; j++) {
    const cp = chars[j].codePointAt(0)!
    if (cp >= 0x80) return null
    out.push(cp)
  }
  for (let idx = basic > 0 ? basic + 1 : 0; idx < inputLength;) {
    const oldi = i
    let w = 1
    for (let k = BASE; ; k += BASE) {
      if (idx >= inputLength) return null
      const digit = punyBasicToDigit(chars[idx++].codePointAt(0)!)
      if (digit >= BASE) return null
      if (digit > nativeMathFloor((MAX_INT - i) / w)) return null
      i += digit * w
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias
      if (digit < t) break
      const baseMinusT = BASE - t
      if (w > nativeMathFloor(MAX_INT / baseMinusT)) return null
      w *= baseMinusT
    }
    const outLen = out.length + 1
    bias = adapt(i - oldi, outLen, oldi == 0)
    if (nativeMathFloor(i / outLen) > MAX_INT - n) return null
    n += nativeMathFloor(i / outLen)
    i %= outLen
    if (n < 0x80 || n > 0x10ffff) return null
    out.splice(i, 0, n)
    i++
  }
  return nativeStringFromCodePoint(...out)
}
const domainToASCII = (domain: string): string | null | undefined => {
  if (isASCII(domain)) {
    // Even pure-ASCII domains must reject forbidden host code points.
    for (const ch of domain) {
      const cp = ch.codePointAt(0)!
      if (isForbiddenHostCP(cp) || cp <= 0x1f || cp == 0x7f || cp == 0x25) return
    }
    return domain.toLowerCase()
  }
  let norm = domain
  try {
    norm = domain.normalize('NFC')
  } catch {
    /* ignore */
  }
  // WHATWG/UTS46 mapping pass. Single code points fold to their ASCII
  // equivalents (fullwidth, ideographic full stop, mathematical symbols,
  // selected compatibility symbols, etc.). "Mapped to nothing" code points
  // are dropped, except joiners (ZWJ/ZWNJ) that are valid in their context
  // (e.g. a ZWJ preceded by a virama) which are kept. We normalize again
  // afterwards so combining marks collapse (e.g. "=­̸" → "≠") before a second
  // mapping pass.
  const mapOnce = (str: string): string => {
    const chars = [...str]
    const mapped = chars.map(ch => {
      const cp = ch.codePointAt(0)!
      if (cp >= 0xff01 && cp <= 0xff5e) return nativeStringFromCodePoint(cp - 0xfee0) // fullwidth -> ASCII
      if (cp == 0x3002 || cp == 0xff0e || cp == 0xff61) return '.' // ideographic/fullwidth full stop -> '.'
      if (cp >= 0x1d400 && cp <= 0x1d7ff) {
        // Mathematical alphanumeric symbols fold to A–Z (even 26-blocks) or
        // a–z (odd 26-blocks); lowercased later.
        const base = cp - 0x1d400
        const upper = (Math.floor(base / 26) & 1) == 0
        return nativeStringFromCodePoint((upper ? 0x41 : 0x61) + (base % 26))
      }
      const single = uts46SingleMap(cp)
      if (single != null) return single
      return ch
    })
    return mapped
      .filter((ch, idx) => {
        const cp = ch.codePointAt(0)!
        if (cp == 0x200d || cp == 0x200c) {
          const prev = idx > 0 ? mapped[idx - 1].codePointAt(0)! : null
          const next = idx < mapped.length - 1 ? mapped[idx + 1].codePointAt(0)! : null
          return joinerValid(cp, prev, next)
        }
        return !isIdnaMappedToNothing(cp)
      })
      .join('')
  }
  norm = mapOnce(norm)
  try {
    norm = norm.normalize('NFC')
  } catch {
    /* ignore */
  }
  norm = mapOnce(norm)
  const labels = norm.split('.')
  // A label that already looks punycode-encoded (starts with "xn--") must
  // decode to a non-ASCII string; a purely-ASCII decode means the input was
  // a bogus/redundant encoding and the domain is rejected (per WHATWG).
  for (const l of labels) {
    if (l.toLowerCase().startsWith('xn--')) {
      const decoded = punyDecode(l.slice(4))
      if (decoded == null || isASCII(decoded)) return
      // A decoded xn-- label whose code points are disallowed (e.g. a
      // redundant encoding that decodes to a control character such as
      // U+0080) must also fail.
      for (const ch of decoded) {
        const cp = ch.codePointAt(0)!
        if (cp >= 0xd800 && cp <= 0xdfff) return
        if ((cp & 0xfffe) == 0xfffe) return
        if (cp >= 0xfdd0 && cp <= 0xfdef) return
        if (isIdnaDisallowed(cp)) return
      }
    }
  }
  // A leading empty label (e.g. a lone joiner that was dropped, leaving
  // ".example") makes the domain invalid. Other empty labels are allowed.
  if (labels[0] == '') return
  // RFC 5893 Bidi rule: a label mixing LTR and RTL directionality (or
  // containing a Bidi control character) is rejected. Encoded labels are
  // checked against their decoded form.
  for (const l of labels) {
    const target = l.toLowerCase().startsWith('xn--') ? (punyDecode(l.slice(4)) ?? '') : l
    if (!bidiValid(target)) return
  }

  // Reject surrogate code points, noncharacters, and IDNA-disallowed
  // whitespace/control code points per WHATWG host rules.
  for (const l of labels) {
    for (const ch of l) {
      const cp = ch.codePointAt(0)!
      if (cp >= 0xd800 && cp <= 0xdfff) return // lone surrogate
      if ((cp & 0xfffe) == 0xfffe) return // noncharacter (U+FFFE, U+FFFF, ...)
      if (cp >= 0xfdd0 && cp <= 0xfdef) return // noncharacters
      if (isIdnaDisallowed(cp)) return // disallowed whitespace/controls
    }
  }
  const ascii = labels.map(l => {
    // A label is punycode-encoded unless it consists solely of ASCII code
    // points (< 0x80); this covers non-ASCII letters and uppercase input.
    const allBasic = [...l.toLowerCase()].every(ch => ch.codePointAt(0)! < 0x80)
    if (allBasic) return l.toLowerCase()
    return `xn--${punyEncode(l)}`
  })
  const result = ascii.join('.').toLowerCase()
  if (result == '') return
  // The result of IDNA mapping may legitimately contain code points such as
  // "<" (from "≮"); only C0 controls, DEL and "%" are rejected here.
  for (const ch of result) {
    const cp = ch.codePointAt(0)!
    if (cp <= 0x1f || cp == 0x7f || cp == 0x25) return
  }
  return result
}

// ---- host parsing ----
const enum HK {
  none = 0,
  empty = 1,
  domain = 2,
  ipv4 = 3,
  ipv6 = 4,
  opaque = 5,
}
type Host =
  | { $kind: HK.none }
  | { $kind: HK.empty }
  | { $kind: HK.domain; $value: string }
  | { $kind: HK.ipv4; $value: number }
  | { $kind: HK.ipv6; $value: number[] }
  | { $kind: HK.opaque; $value: string }

const parseIPv4Number = (input: string): [number, boolean] | null | undefined => {
  if (input == '') return
  let err = false,
    r = 10
  if (input.length >= 2 && (input.startsWith('0x') || input.startsWith('0X'))) {
    err = true
    input = input.slice(2)
    r = 16
  } else if (input.length >= 2 && input[0] == '0') {
    err = true
    input = input.slice(1)
    r = 8
  }
  if (input == '') return [0, true]
  for (const ch of input) {
    const d = nativeParseInt(ch, r)
    if (nativeNumberIsNaN(d) || d >= r) return
  }
  const out = nativeParseInt(input, r)
  if (nativeNumberIsNaN(out)) return
  return [out, err]
}
const parseIPv4 = (input: string): number | null | undefined => {
  const parts = input.split('.')
  if (parts[parts.length - 1] == '') {
    if (parts.length > 1) parts.pop()
  }
  if (parts.length > 4) return
  const nums: number[] = []
  for (const p of parts) {
    const r = parseIPv4Number(p)
    if (r == null) return
    nums.push(r[0])
  }
  for (let i = 0; i < nums.length - 1; i++) if (nums[i] > 255) return
  if (nums[nums.length - 1] >= nativeMathPow(256, 5 - nums.length)) return
  let ipv4 = nums[nums.length - 1]
  nums.pop()
  let counter = 0
  for (const nm of nums) {
    ipv4 += nm * nativeMathPow(256, 3 - counter)
    counter++
  }
  return ipv4
}
const endsInNumber = (input: string): boolean => {
  const parts = input.split('.')
  if (parts[parts.length - 1] == '') parts.pop()
  const last = parts[parts.length - 1]
  if (last == null) return false
  if (last != '' && /^[0-9]+$/.test(last)) return true
  return parseIPv4Number(last) != null
}
const parseIPv6 = (input: string): number[] | null | undefined => {
  const pieces = [0, 0, 0, 0, 0, 0, 0, 0]
  let pieceIndex = 0,
    compress: number | null = null
  const chars = [...input].map(c => c.codePointAt(0)!)
  let pointer = 0
  const atEnd = () => pointer >= chars.length
  const cur = () => (atEnd() ? null : chars[pointer])
  if (cur() == 0x3a) {
    if (chars[pointer + 1] != 0x3a) return
    pointer += 2
    pieceIndex++
    compress = pieceIndex
  }
  while (!atEnd()) {
    if (pieceIndex == 8) return
    if (cur() == 0x3a) {
      if (compress != null) return
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
    if (cur() == 0x2e) {
      if (length == 0) return
      pointer -= length
      if (pieceIndex > 6) return
      let numbersSeen = 0
      while (!atEnd()) {
        let ipv4Piece: number | null = null
        if (numbersSeen > 0) {
          if (cur() == 0x2e && numbersSeen < 4) pointer++
          else return
        }
        if (!isDigit(cur()!)) return
        while (isDigit(cur()!)) {
          const number = cur()! - 0x30
          if (ipv4Piece == null) ipv4Piece = number
          else if (ipv4Piece == 0) return
          else ipv4Piece = ipv4Piece * 10 + number
          if ((ipv4Piece as number) > 255) return
          pointer++
        }
        pieces[pieceIndex] = pieces[pieceIndex] * 0x100 + (ipv4Piece as number)
        numbersSeen++
        if (numbersSeen == 2 || numbersSeen == 4) pieceIndex++
      }
      if (numbersSeen != 4) return
      break
    } else if (cur() == 0x3a) {
      pointer++
      if (atEnd()) return
    } else if (cur() != null) {
      return
    }
    pieces[pieceIndex] = value
    pieceIndex++
  }
  if (compress != null) {
    let swaps = pieceIndex - compress
    pieceIndex = 7
    while (pieceIndex != 0 && swaps > 0) {
      const tmp = pieces[pieceIndex]
      pieces[pieceIndex] = pieces[compress + swaps - 1]
      pieces[compress + swaps - 1] = tmp
      pieceIndex--
      swaps--
    }
  } else if (compress == null && pieceIndex != 8) {
    return
  }
  return pieces
}
const parseOpaqueHost = (input: string): string | null | undefined => {
  // The opaque-host parser only rejects forbidden host code points. Every
  // other code point (incl. C0 controls such as U+0001–U+001F and U+007F,
  // and code points outside the URL-code-point set) is percent-encoded via
  // the C0 control set, matching the WHATWG/WPT reference behavior.
  for (const ch of input) {
    const cp = ch.codePointAt(0)!
    if (isForbiddenHostCP(cp)) return
  }
  return utf8Pct(input, inC0)
}
const parseHost = (input: string, isOpaque: boolean): Host | null | undefined => {
  if (input[0] == '[') {
    if (input[input.length - 1] != ']') return
    const addr = parseIPv6(input.slice(1, -1))
    if (addr == null) return
    return { $kind: HK.ipv6, $value: addr }
  }
  if (isOpaque) {
    const o = parseOpaqueHost(input)
    return o == null ? null : { $kind: HK.opaque, $value: o }
  }
  if (input == '') return { $kind: HK.empty }
  // A host must be valid UTF-8 after percent-decoding; a replacement
  // character (U+FFFD) means the input was not valid UTF-8, which fails.
  const decoded = utf8Decode(percentDecodeBytes(utf8Encode(input)))
  if (decoded.includes('�')) return
  const domain = decoded
  const ascii = domainToASCII(domain)
  if (ascii == null) return
  if (endsInNumber(ascii)) {
    const ipv4 = parseIPv4(ascii)
    if (ipv4 == null) return
    return { $kind: HK.ipv4, $value: ipv4 }
  }
  return { $kind: HK.domain, $value: ascii }
}

// ---- URL record ----
interface URLRecord {
  _scheme: string
  _username: string
  _password: string
  _host: Host
  _port: number | null
  _path: string[] | string // string => opaque path
  _query: string | null
  _fragment: string | null
}

const DEFAULT_PORTS: Record<string, number> = {
  ftp: 21,
  file: null as unknown as number,
  http: 80,
  https: 443,
  ws: 80,
  wss: 443,
}
const isSpecial = (scheme: string): boolean => {
  return scheme in DEFAULT_PORTS
}
const defaultPort = (scheme: string): number | undefined => {
  return DEFAULT_PORTS[scheme]
}
const cannotHaveUserPwdPort = (rec: URLRecord): boolean => {
  return rec._host.$kind == HK.none || rec._host.$kind == HK.empty || rec._scheme == 'file'
}

const serializeIPv4 = (n: number): string => {
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`
}
const findCompressed = (pieces: number[]): number | null | undefined => {
  let longest = null,
    longestSize = 1,
    found = null,
    foundSize = 0
  for (let i = 0; i < 8; i++) {
    if (pieces[i] != 0) {
      if (foundSize > longestSize) {
        longest = found
        longestSize = foundSize
      }
      found = null
      foundSize = 0
    } else {
      if (found == null) found = i
      foundSize++
    }
  }
  if (foundSize > longestSize) return found
  return longest
}
const serializeIPv6 = (pieces: number[]): string => {
  let out = ''
  const compress = findCompressed(pieces)
  let ignore0 = false
  for (let i = 0; i < 8; i++) {
    if (ignore0 && pieces[i] == 0) continue
    if (ignore0) ignore0 = false
    if (i == compress) {
      out += i == 0 ? '::' : ':'
      ignore0 = true
      continue
    }
    out += pieces[i].toString(16).toLowerCase()
    if (i != 7) out += ':'
  }
  return out
}
const serializeHost = (host: Host, scheme?: string): string => {
  if (scheme == 'file' && host.$kind == HK.domain && host.$value == 'localhost') return ''
  if (host.$kind == HK.ipv4) return serializeIPv4(host.$value)
  if (host.$kind == HK.ipv6) return `[${serializeIPv6(host.$value)}]`
  if (host.$kind == HK.domain || host.$kind == HK.opaque) return host.$value
  return '' // empty / none
}

const shortenPath = (rec: URLRecord): void => {
  if (rec._path === '' || !nativeArrayIsArray(rec._path)) return
  if (rec._scheme == 'file' && rec._path.length == 1 && isWindowsDriveLetter(rec._path[0])) return
  if (rec._path.length > 0) rec._path.pop()
}

// Windows drive letter: two code points, first ASCII alpha, second ':' or '|'.
const isWindowsDriveLetter = (seg: string): boolean => {
  if (seg.length < 2) return false
  const a = seg.codePointAt(0)!,
    b = seg.codePointAt(1)!
  return isAlpha(a) && (b == 0x3a || b == 0x7c)
}
const startsWithWindowsDriveLetter = (s: string): boolean => {
  if (s.length < 2) return false
  const a = s.codePointAt(0)!,
    b = s.codePointAt(1)!
  if (!isAlpha(a) || !(b == 0x3a || b == 0x7c)) return false
  if (s.length == 2) return true
  const d = s.codePointAt(2)!
  return d == 0x2f || d == 0x5c || d == 0x3f || d == 0x23
}

// ---- basic URL parser ----
const enum S {
  schemeStart = 0,
  scheme = 1,
  noScheme = 2,
  specialRelOrAuth = 3,
  pathOrAuth = 4,
  relative = 5,
  relativeSlash = 6,
  authority = 7,
  host = 8,
  hostname = 9,
  port = 10,
  file = 11,
  fileSlash = 12,
  fileHost = 13,
  pathStart = 14,
  path = 15,
  opaquePath = 16,
  query = 17,
  fragment = 18,
  specialAuthSlashes = 19,
  specialAuthIgnoreSlashes = 20,
}
type State = number

const basicURLParser = (
  input: string,
  base?: URLRecord | null,
  url?: URLRecord | null,
  stateOverride?: State | null,
): URLRecord | null | undefined => {
  input = nativeString(input)
  if (url == null) {
    const rec: URLRecord = {
      _scheme: '',
      _username: '',
      _password: '',
      _host: { $kind: HK.none },
      _port: null,
      _path: [],
      _query: null,
      _fragment: null,
    }
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
      return d != 0x09 && d != 0x0a && d != 0x0d
    })
    .join('')

  const cps = [...input]
  const len = cps.length
  // `remaining` is the substring from pointer (inclusive), matching the spec.
  const remaining = (p: number) => cps.slice(nativeMathMax(0, p)).join('')
  let state: State = stateOverride ?? S.schemeStart
  let buffer = ''
  let atSignSeen = false,
    insideBrackets = false,
    passwordTokenSeen = false
  let pointer = 0

  const FS = (x: number) => isSpecial(url._scheme) && x == 0x5c
  const opaque = () => !isSpecial(url._scheme) && url._scheme != ''

  while (true) {
    const c = pointer >= len ? null : cps[pointer]
    const cp = c == null ? -1 : c.codePointAt(0)!

    switch (state) {
      case S.schemeStart: {
        if (c != null && isAlpha(cp)) {
          buffer += nativeStringFromCodePoint(cp).toLowerCase()
          state = S.scheme
        } else if (stateOverride == null) {
          state = S.noScheme
          pointer--
        } else return
        break
      }
      case S.scheme: {
        if (c != null && (isAlnum(cp) || cp == 0x2b || cp == 0x2d || cp == 0x2e)) {
          buffer += nativeStringFromCodePoint(cp).toLowerCase()
        } else if (cp == 0x3a) {
          if (stateOverride != null) {
            if (isSpecial(url._scheme) && !isSpecial(buffer)) return url // no-op
            if (!isSpecial(url._scheme) && isSpecial(buffer)) return url
            if (
              (url._username != '' || url._password != '' || url._port != null) &&
              buffer == 'file'
            )
              return url
            if (url._scheme == 'file' && url._host.$kind == HK.empty) return url
          }
          url._scheme = buffer
          if (stateOverride != null) {
            if (url._port == defaultPort(url._scheme)) url._port = null
            return url
          }
          buffer = ''
          if (url._scheme == 'file') {
            state = S.file
          } else if (isSpecial(url._scheme)) {
            if (base != null && base._scheme == url._scheme) state = S.specialRelOrAuth
            else state = S.specialAuthSlashes
          } else if (cps[pointer + 1] == '/' && cps[pointer + 2] == '/') {
            state = S.authority
            pointer += 2
          } else if (cps[pointer + 1] == '/') {
            // single slash after scheme: host is omitted (none), path follows.
            state = S.pathStart
          } else {
            url._path = ''
            state = S.opaquePath
          }
        } else if (stateOverride == null) {
          buffer = ''
          state = S.noScheme
          pointer = -1
        } else return
        break
      }
      case S.noScheme: {
        const baseOpaque = base != null && !nativeArrayIsArray(base._path)
        if (base == null || (baseOpaque && cp != 0x23)) return
        if (baseOpaque && cp == 0x23) {
          url._scheme = base._scheme
          url._path = base._path
          url._query = base._query
          url._fragment = ''
          state = S.fragment
        } else if (base._scheme != 'file') {
          state = S.relative
          pointer--
        } else {
          state = S.file
          pointer--
        }
        break
      }
      case S.specialRelOrAuth: {
        if (cp == 0x2f && remaining(pointer).startsWith('//')) {
          state = S.specialAuthIgnoreSlashes
          pointer++
        } else {
          /* validation error */ state = S.relative
          pointer--
        }
        break
      }
      case S.pathOrAuth: {
        if (cp == 0x2f) state = S.authority
        else {
          state = S.path
          pointer--
        }
        break
      }
      case S.relative: {
        url._scheme = base!._scheme
        if (cp == 0x2f) state = S.relativeSlash
        else if (FS(cp)) {
          /* validation error */ state = S.relativeSlash
        } else {
          url._username = base!._username
          url._password = base!._password
          url._host = base!._host
          url._port = base!._port
          url._path = nativeArrayIsArray(base!._path) ? [...base!._path] : []
          url._query = base!._query
          if (cp == 0x3f) {
            url._query = ''
            state = S.query
          } else if (cp == 0x23) {
            url._fragment = ''
            state = S.fragment
          } else if (c != null) {
            url._query = null
            shortenPath(url)
            state = S.path
            pointer--
          }
        }
        break
      }
      case S.relativeSlash: {
        if (isSpecial(url._scheme) && (cp == 0x2f || FS(cp))) {
          state = S.specialAuthIgnoreSlashes
        } else if (cp == 0x2f) state = S.authority
        else {
          url._username = base!._username
          url._password = base!._password
          url._host = base!._host
          url._port = base!._port
          state = S.path
          pointer--
        }
        break
      }
      case S.specialAuthSlashes: {
        if (cp == 0x2f && remaining(pointer).startsWith('//')) {
          state = S.specialAuthIgnoreSlashes
          pointer++
        } else {
          /* validation error */ state = S.specialAuthIgnoreSlashes
          pointer--
        }
        break
      }
      case S.specialAuthIgnoreSlashes: {
        if (cp != 0x2f && cp != 0x5c) {
          state = S.authority
          pointer--
        }
        break
      }
      case S.authority: {
        if (cp == 0x40) {
          if (atSignSeen) buffer = `%40${buffer}`
          atSignSeen = true
          for (const ch of buffer) {
            const ccp = ch.codePointAt(0)!
            if (ccp == 0x3a && !passwordTokenSeen) {
              passwordTokenSeen = true
              continue
            }
            if (passwordTokenSeen) url._password += utf8Pct(ch, inUser)
            else url._username += utf8Pct(ch, inUser)
          }
          buffer = ''
        } else if (c == null || cp == 0x2f || cp == 0x3f || cp == 0x23 || FS(cp)) {
          if (atSignSeen && buffer == '') return
          pointer -= [...buffer].length + 1
          buffer = ''
          state = S.host
        } else buffer += c
        break
      }
      case S.host:
      case S.hostname: {
        if (stateOverride == S.host && url._scheme == 'file') {
          pointer--
          state = S.fileHost
          break
        }
        if (cp == 0x3a && !insideBrackets) {
          if (buffer == '') return
          if (stateOverride == S.hostname) return
          const host = parseHost(buffer, opaque())
          if (host == null) return
          url._host = host
          buffer = ''
          if (url._scheme == 'file' && host.$kind == HK.domain && host.$value == 'localhost')
            url._host = { $kind: HK.empty }
          state = S.port
        } else if (c == null || cp == 0x2f || cp == 0x3f || cp == 0x23 || FS(cp)) {
          pointer--
          if (buffer == '') {
            if (url._host.$kind == HK.none) {
              if (isSpecial(url._scheme) && url._scheme != 'file') return
              // Non-special (or file) with an omitted host: the host is empty.
              // An explicit empty host (`//` with no host) is NOT inherited
              // from the base — only a truly elided host (no `//`) inherits,
              // which is handled by the relative state.
              url._host = { $kind: HK.empty }
              state = S.pathStart
              if (stateOverride != null) return url
              break
            } else if (stateOverride != null) {
              // Clearing an existing host (e.g. file://hi/ with hostname="",
              // or a non-special scheme). Special schemes keep their host.
              if (isSpecial(url._scheme) && url._scheme != 'file') return
              // If credentials/port are present, an empty host is kept as-is.
              if (url._username != '' || url._password != '' || url._port != null) return url
              url._host = { $kind: HK.empty }
              state = S.pathStart
              return url
            }
          }
          if (
            stateOverride != null &&
            buffer == '' &&
            (url._username != '' || url._password != '' || url._port != null)
          )
            return
          const host = parseHost(buffer, opaque())
          if (host == null) return
          url._host = host
          buffer = ''
          if (url._scheme == 'file' && host.$kind == HK.domain && host.$value == 'localhost')
            url._host = { $kind: HK.empty }
          state = S.pathStart
          if (stateOverride != null) return url
        } else {
          if (cp == 0x5b) insideBrackets = true
          else if (cp == 0x5d) insideBrackets = false
          buffer += c
        }
        break
      }
      case S.port: {
        if (isDigit(cp)) buffer += nativeStringFromCodePoint(cp)
        else if (
          c == null ||
          cp == 0x2f ||
          cp == 0x3f ||
          cp == 0x23 ||
          FS(cp) ||
          stateOverride != null
        ) {
          if (buffer != '') {
            const port = nativeParseInt(buffer, 10)
            if (nativeNumberIsNaN(port) || port > 65535) return // out of range
            url._port = port == defaultPort(url._scheme) ? null : port
            buffer = ''
            if (url._scheme == 'file') return // file URLs must not have a port
            if (stateOverride != null) return url
          } else if (stateOverride != null) return
          state = S.pathStart
          pointer--
        } else return
        break
      }
      case S.file: {
        url._scheme = 'file'
        url._host = { $kind: HK.empty }
        if (cp == 0x2f || FS(cp)) {
          state = S.fileSlash
        } else if (base != null && base._scheme == 'file') {
          url._host = base._host
          url._path = nativeArrayIsArray(base._path) ? [...base._path] : []
          url._query = base._query
          if (cp == 0x3f) {
            url._query = ''
            state = S.query
          } else if (cp == 0x23) {
            url._fragment = ''
            state = S.fragment
          } else if (c != null) {
            url._query = null
            if (!startsWithWindowsDriveLetter(remaining(pointer))) shortenPath(url)
            else {
              /* validation error */ url._path = []
            }
            state = S.path
            pointer--
          }
        } else {
          state = S.path
          pointer--
        }
        break
      }
      case S.fileSlash: {
        if (cp == 0x2f || FS(cp)) {
          state = S.fileHost
        } else {
          if (base != null && base._scheme == 'file') {
            url._host = base._host
            if (
              !startsWithWindowsDriveLetter(remaining(pointer)) &&
              nativeArrayIsArray(base._path) &&
              base._path[0] != null &&
              isWindowsDriveLetter(base._path[0])
            ) {
              if (nativeArrayIsArray(url._path)) url._path.push(base._path[0])
            }
          }
          state = S.path
          pointer--
        }
        break
      }
      case S.fileHost: {
        if (c == null || cp == 0x2f || cp == 0x5c || cp == 0x3f || cp == 0x23) {
          pointer--
          if (stateOverride == null && isWindowsDriveLetter(buffer)) {
            /* validation error */ state = S.path
          } else if (buffer == '') {
            url._host = { $kind: HK.empty }
            if (stateOverride != null) return url
            state = S.pathStart
          } else {
            let h = parseHost(buffer, false)
            if (h == null) return
            if (h.$kind == HK.domain && h.$value == 'localhost') h = { $kind: HK.empty }
            url._host = h
            if (stateOverride != null) return url
            buffer = ''
            state = S.pathStart
          }
        } else buffer += c
        break
      }
      case S.pathStart: {
        if (isSpecial(url._scheme)) {
          state = S.path
          if (cp != 0x2f && !FS(cp)) pointer--
        } else if (stateOverride == null && cp == 0x3f) {
          url._query = ''
          state = S.query
        } else if (stateOverride == null && cp == 0x23) {
          url._fragment = ''
          state = S.fragment
        } else if (c != null) {
          state = S.path
          if (cp != 0x2f) pointer--
        } else if (stateOverride != null && url._host.$kind == HK.none) {
          url._path = ['']
        }
        break
      }
      case S.path: {
        if (
          c == null ||
          cp == 0x2f ||
          FS(cp) ||
          (stateOverride == null && (cp == 0x3f || cp == 0x23))
        ) {
          // A path segment that is a single or double dot, possibly
          // percent-encoded as %2e / %2E, must be normalized.
          const decoded = utf8Decode(percentDecodeBytes(utf8Encode(buffer))).toLowerCase()
          if (decoded == '..') {
            shortenPath(url)
            if (cp != 0x2f && !FS(cp)) {
              if (nativeArrayIsArray(url._path)) url._path.push('')
            }
          } else if (decoded == '.') {
            if (cp != 0x2f && !FS(cp)) {
              if (nativeArrayIsArray(url._path)) url._path.push('')
            }
          } else {
            if (
              url._scheme == 'file' &&
              nativeArrayIsArray(url._path) &&
              url._path.length == 0 &&
              startsWithWindowsDriveLetter(buffer)
            ) {
              buffer = `${buffer[0]}:${buffer.slice(2)}`
            }
            if (nativeArrayIsArray(url._path)) url._path.push(buffer)
          }
          buffer = ''
          if (cp == 0x3f) {
            url._query = ''
            state = S.query
          } else if (cp == 0x23) {
            url._fragment = ''
            state = S.fragment
          }
        } else {
          buffer += utf8Pct(c!, inPath)
        }
        break
      }
      case S.opaquePath: {
        if (cp == 0x3f) {
          url._path = buffer
          url._query = ''
          buffer = ''
          state = S.query
        } else if (cp == 0x23) {
          url._path = buffer
          url._fragment = ''
          buffer = ''
          state = S.fragment
        } else if (cp == 0x20) {
          const nxt = cps.slice(pointer + 1).join('')
          if (nxt.startsWith('?') || nxt.startsWith('#')) buffer += '%20'
          else buffer += ' '
        } else if (c != null) {
          buffer += utf8Pct(c!, inC0)
        }
        if (c == null) {
          url._path = buffer
        }
        break
      }
      case S.query: {
        const set = isSpecial(url._scheme) ? inSQuery : inQuery
        if (stateOverride == null && cp == 0x23) {
          url._query = (url._query ?? '') + utf8Pct(buffer, set)
          buffer = ''
          url._fragment = ''
          state = S.fragment
        } else if (c != null && cp != 0x23) {
          buffer += c
        } else {
          url._query = (url._query ?? '') + utf8Pct(buffer, set)
          buffer = ''
          if (cp == 0x23) {
            url._fragment = ''
            state = S.fragment
          }
        }
        break
      }
      case S.fragment: {
        if (c != null) {
          url._fragment = (url._fragment ?? '') + utf8Pct(c!, inFrag)
        }
        break
      }
    }

    if (pointer >= len) break
    pointer++
  }

  // Inherit host/username/password/port (and opaque path) from base when the
  // authority was elided, per WHATWG "If url's host is null" step.
  // For special (host-based) relative references whose host is absent,
  // inherit the base's host/credentials/port. Non-special (opaque-path)
  // URLs must NOT inherit the base host.
  if (
    url._host.$kind == HK.none &&
    base != null &&
    base._host.$kind != HK.none &&
    isSpecial(url._scheme)
  ) {
    url._username = base._username
    url._password = base._password
    url._host = base._host
    url._port = base._port
  }

  // A special scheme (other than file) must have a non-null host.
  if (
    stateOverride == null &&
    isSpecial(url._scheme) &&
    url._scheme != 'file' &&
    url._host.$kind == HK.none
  )
    return

  return url
}

// ---- serialization ----
const serializePath = (url: URLRecord): string => {
  if (!nativeArrayIsArray(url._path)) return url._path // opaque
  let out = ''
  for (const seg of url._path) out += `/${seg}`
  return out
}

const serializeOrigin = (rec: URLRecord): string | null | undefined => {
  switch (rec._scheme) {
    case 'blob': {
      // A blob URL's origin is derived from its inner (opaque-path) URL.
      if (!nativeArrayIsArray(rec._path)) {
        const inner = basicURLParser(rec._path)
        if (
          inner != null &&
          (inner._scheme == 'http' || inner._scheme == 'https' || inner._scheme == 'file')
        ) {
          return serializeOrigin(inner)
        }
      }
      return // opaque origin -> null (we represent opaque as null)
    }
    case 'ftp':
    case 'http':
    case 'https':
    case 'ws':
    case 'wss':
      return `${rec._scheme}://${serializeHost(rec._host, rec._scheme)}${rec._port != null ? `:${rec._port}` : ''}`
    case 'file':
      return 'file://'
  }
}

// application/x-www-form-urlencoded parser (operates on a string -> bytes).
const parseFormString = (input: string): Tuple[] => {
  const bytes = utf8Encode(input)
  const sequences = splitBytes(bytes, 0x26)
  const output: Tuple[] = []
  for (const seq of sequences) {
    if (seq.length == 0) continue
    let nameBytes: Uint8Array, valueBytes: Uint8Array
    const eq = seq.indexOf(0x3d)
    if (eq == -1) {
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
const splitBytes = (bytes: Uint8Array, sep: number): Uint8Array[] => {
  const out: Uint8Array[] = []
  let start = 0
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] == sep) {
      out.push(bytes.slice(start, i))
      start = i + 1
    }
  }
  out.push(bytes.slice(start))
  return out
}
const replacePlus = (bytes: Uint8Array): Uint8Array => {
  return nativeUint8Array.from(bytes.map(b => (b == 0x2b ? 0x20 : b)))
}
const serializeFormList = (list: Tuple[]): string => {
  let out = ''
  let first = true
  for (const [name, value] of list) {
    if (!first) out += '&'
    first = false
    out += `${formPct(name)}=${formPct(value)}`
  }
  return out
}
const parseBase = (base: string | URL | undefined): URLRecord | null | undefined => {
  if (base == null) return
  if (typeof base == 'string') return basicURLParser(base)
  return (base as any as _URL)._record
}

// ---- URLSearchParams ----
type Tuple = [string, string]

type _URLSearchParams = typeof URLSearchParams & { _list: Tuple[]; _url: URL | null }
export class URLSearchParams {
  private _list: Tuple[] = []
  private _url: URL | undefined

  constructor(init?: string | string[][] | Record<string, string> | Iterable<[string, string]>) {
    if (typeof init == 'string') {
      let s = init
      if (s[0] == '?') s = s.slice(1)
      this._list = parseFormString(s)
    } else if (nativeArrayIsArray(init)) {
      for (const inner of init) {
        if (inner.length != 2) throw new TypeError('Each tuple must have exactly two elements')
        this._list.push([nativeString(inner[0]), nativeString(inner[1])])
      }
    } else if (init && typeof init == 'object') {
      // record (or any iterable of pairs)
      if (typeof (init as { [Symbol.iterator]?: unknown })[Symbol.iterator] == 'function') {
        for (const pair of init as Iterable<[string, string]>) {
          const arr = [...pair]
          if (arr.length != 2) throw new TypeError('Each tuple must have exactly two elements')
          this._list.push([nativeString(arr[0]), nativeString(arr[1])])
        }
      } else {
        for (const key of Object.keys(init)) {
          this._list.push([key, nativeString((init as Record<string, string>)[key])])
        }
      }
    }
  }

  private update(): void {
    if (this._url == null) return
    const s = serializeFormList(this._list)
    ;(this._url as any as _URL)._record._query = s
  }

  get size(): number {
    return this._list.length
  }

  append(name: string, value: string): void {
    this._list.push([nativeString(name), nativeString(value)])
    this.update()
  }
  delete(name: string, value?: string): void {
    if (value != null) {
      this._list = this._list.filter(t => !(t[0] == name && t[1] == value))
    } else {
      this._list = this._list.filter(t => t[0] != name)
    }
    this.update()
  }
  get(name: string): string | null {
    const t = this._list.find(x => x[0] == name)
    return t ? t[1] : null
  }
  getAll(name: string): string[] {
    return this._list.filter(x => x[0] == name).map(x => x[1])
  }
  has(name: string, value?: string): boolean {
    return value != null
      ? this._list.some(t => t[0] == name && t[1] == value)
      : this._list.some(t => t[0] == name)
  }
  set(name: string, value: string): void {
    const n = nativeString(name),
      v = nativeString(value)
    let found = false
    this._list = this._list.filter(t => {
      if (t[0] != n) return true
      if (!found) {
        found = true
        t[1] = v
        return true
      }
      return false
    })
    if (!found) this._list.push([n, v])
    this.update()
  }
  sort(): void {
    this._list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    this.update()
  }

  keys(): IterableIterator<string> {
    return this._list.map(t => t[0])[Symbol.iterator]()
  }
  values(): IterableIterator<string> {
    return this._list.map(t => t[1])[Symbol.iterator]()
  }
  entries(): IterableIterator<[string, string]> {
    return this._list.map(t => [t[0], t[1]] as [string, string])[Symbol.iterator]()
  }
  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries()
  }
  forEach(
    cb: (value: string, name: string, self: URLSearchParams) => void,
    thisArg?: unknown,
  ): void {
    for (const [k, v] of this._list) cb.call(thisArg, v, k, this)
  }

  toString(): string {
    return serializeFormList(this._list)
  }
}

// ---- URL ----
type _URL = typeof URL & { _record: URLRecord; _urlSearchParams: URLSearchParams }
export class URL {
  private _record: URLRecord
  private _urlSearchParams: URLSearchParams

  constructor(url: string | URL, base?: string | URL) {
    const baseRec = parseBase(base)
    if (baseRec == null && base != null) throw new TypeError('Invalid base URL')
    const parsed = basicURLParser(url as string, baseRec)
    if (parsed == null) throw new TypeError('Invalid URL')
    this._record = parsed
    this._urlSearchParams = new URLSearchParams(this._record._query ?? '')
    ;(this._urlSearchParams as any as _URLSearchParams)._url = this
  }

  get href(): string {
    const rec = this._record
    let out = `${rec._scheme}:`
    if (rec._host.$kind != HK.none) {
      out += '//'
      if (rec._username != '' || rec._password != '') {
        out += rec._username
        if (rec._password != '') out += `:${rec._password}`
        out += '@'
      }
      out += serializeHost(rec._host, rec._scheme)
      if (rec._port != null) out += `:${rec._port}`
    }
    // if host null, not opaque, path size>1 and path[0]=='' => append "/."
    if (
      rec._host.$kind == HK.none &&
      nativeArrayIsArray(rec._path) &&
      rec._path.length > 1 &&
      rec._path[0] == ''
    ) {
      out += '/.'
    }
    out += serializePath(rec)
    if (rec._query != null) out += `?${rec._query}`
    if (rec._fragment != null) out += `#${rec._fragment}`
    return out
  }
  set href(v: string) {
    const parsed = basicURLParser(v)
    if (parsed == null) throw new TypeError('Invalid URL')
    this._record = parsed
    const q = this._record._query
    ;(this._urlSearchParams as any as _URLSearchParams)._list = q == null ? [] : parseFormString(q)
  }

  get origin(): string {
    const o = serializeOrigin(this._record)
    return o ?? 'null'
  }

  get protocol(): string {
    return `${this._record._scheme}:`
  }
  set protocol(v: string) {
    basicURLParser(`${v}:`, null, this._record, S.schemeStart)
  }

  get username(): string {
    return this._record._username
  }
  set username(v: string) {
    if (cannotHaveUserPwdPort(this._record)) return
    this._record._username = utf8Pct(v, inUser)
  }
  get password(): string {
    return this._record._password
  }
  set password(v: string) {
    if (cannotHaveUserPwdPort(this._record)) return
    this._record._password = utf8Pct(v, inUser)
  }

  get host(): string {
    if (this._record._host.$kind == HK.none) return ''
    if (this._record._port == null) return serializeHost(this._record._host, this._record._scheme)
    return `${serializeHost(this._record._host, this._record._scheme)}:${this._record._port}`
  }
  set host(v: string) {
    if (!nativeArrayIsArray(this._record._path)) return // opaque path
    basicURLParser(v, null, this._record, S.host)
  }

  get hostname(): string {
    if (this._record._host.$kind == HK.none) return ''
    return serializeHost(this._record._host, this._record._scheme)
  }
  set hostname(v: string) {
    if (!nativeArrayIsArray(this._record._path)) return // opaque path
    basicURLParser(v, null, this._record, S.hostname)
  }

  get port(): string {
    return this._record._port == null ? '' : nativeString(this._record._port)
  }
  set port(v: string) {
    if (cannotHaveUserPwdPort(this._record)) return
    if (v == '') {
      this._record._port = null
      return
    }
    basicURLParser(v, null, this._record, S.port)
  }

  get pathname(): string {
    return serializePath(this._record)
  }
  set pathname(v: string) {
    if (!nativeArrayIsArray(this._record._path)) return // opaque path
    this._record._path = []
    basicURLParser(v, null, this._record, S.pathStart)
  }

  get search(): string {
    return this._record._query == null || this._record._query == '' ? '' : `?${this._record._query}`
  }
  set search(v: string) {
    if (v == '') {
      this._record._query = null
      ;(this._urlSearchParams as any as _URLSearchParams)._list = []
      return
    }
    const input = v[0] == '?' ? v.slice(1) : v
    // WHATWG: set the search by UTF-8 percent-encoding the value with the
    // (special-)query set. Tabs/newlines are stripped, and `#` is encoded
    // rather than starting a fragment.
    const cleaned = input.replace(/[\t\n\r]/g, '')
    const set = isSpecial(this._record._scheme) ? inSQuery : inQuery
    this._record._query = utf8Pct(cleaned, set)
    ;(this._urlSearchParams as any as _URLSearchParams)._list = parseFormString(this._record._query)
  }

  get searchParams(): URLSearchParams {
    return this._urlSearchParams
  }

  get hash(): string {
    return this._record._fragment ? `#${this._record._fragment}` : ''
  }
  set hash(v: string) {
    if (v == '') {
      this._record._fragment = null
      return
    }
    const input = v[0] == '#' ? v.slice(1) : v
    this._record._fragment = ''
    basicURLParser(input, null, this._record, S.fragment)
  }

  toString(): string {
    return this.href
  }
  toJSON(): string {
    return this.href
  }

  static parse(url: string | URL, base?: string | URL): URL | null {
    try {
      return new URL(url, base)
    } catch {
      return null
    }
  }

  static canParse(url: string, base?: string | URL): boolean {
    return URL.parse(url, base) != null
  }
}
