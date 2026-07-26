# WHATWG URL & URLSearchParams

> A tiny, zero-dependency WHATWG URL and URLSearchParams implementation for constrained environments.

一个零依赖、零 DOM 依赖的 WHATWG `URL` 与 `URLSearchParams` 实现，可在 Node、小程序、Web Worker、V8 等受限环境中运行。

## 特性

- **零运行时依赖**：不引用 `globalThis` / `window` / `self` / `document` / `location`，可在非浏览器环境直接运行。
- **规范对齐**：覆盖 [WHATWG URL](https://url.spec.whatwg.org/#url) 与 [URLSearchParams](https://url.spec.whatwg.org/#urlsearchparams) 的核心语义。
- **基于 TypeScript**：源码为 `.ts`，对外提供类型声明（`dist/index.d.mts`）。

## 安装

```bash
pnpm i @blyou/whatwg-url
```

## 快速开始

### URL

```ts
import { URL } from '@blyou/whatwg-url'

// 绝对地址解析
const u = new URL('https://user:pass@example.com:8080/path/to?q=1#frag')
u.protocol // 'https:'
u.username // 'user'
u.hostname // 'example.com'
u.port // '8080'
u.pathname // '/path/to'
u.search // '?q=1'
u.hash // '#frag'
u.href // 'https://user:pass@example.com:8080/path/to?q=1#frag'

// 相对地址 + base
new URL('bar', 'http://example.com/foo/').href // 'http://example.com/foo/bar'
new URL('//other.com/', 'http://example.com/').href // 'http://other.com/'
new URL('?x=1', 'http://example.com/foo').href // 'http://example.com/foo?x=1'

// 修改属性会即时反映到 href
const v = new URL('http://example.com/')
v.username = 'user' // 自动 percent-encode
v.href // 'http://user@example.com/'
```

### URLSearchParams

```ts
import { URLSearchParams } from '@blyou/whatwg-url'

const p = new URLSearchParams('a=1&b=2&a=3')
p.get('a') // '1'
p.getAll('a') // ['1', '3']
p.has('b') // true
p.size // 3

p.append('c', '4')
p.set('a', 'x') // 仅保留首个同名键
p.sort() // 按 key 字典序
p.toString() // 'a=x&b=2&c=4'

// 数组 / 对象 / 另一实例构造
new URLSearchParams([
  ['a', '1'],
  ['b', '2'],
])
new URLSearchParams({ a: '1', b: '2' })

// 与 URL 双向绑定
const u = new URL('http://example.com/?a=1')
u.searchParams.append('b', '2')
u.search // '?a=1&b=2'
```

## API 概览

### `URL`

| 成员                                 | 说明                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `new URL(url, base?)`                | 解析绝对/相对地址；`base` 可为字符串或 `URL`；特殊协议缺少主机时抛 `TypeError` |
| `href` / `toString()` / `toJSON()`   | 序列化地址                                                                     |
| `protocol` / `username` / `password` | 协议与用户信息（setter 自动 percent-encode）                                   |
| `host` / `hostname` / `port`         | 主机；特殊协议默认端口在序列化时被省略                                         |
| `pathname`                           | 路径（`.`/`..` 段归一化，相对引用补尾斜杠）                                    |
| `search` / `searchParams`            | 查询串及其实时视图                                                             |
| `hash`                               | 片段（setter 自动 percent-encode）                                             |
| `origin`                             | 特殊协议返回 `scheme://host[:port]`，其余返回 `'null'`                         |

### `URLSearchParams`

| 成员                                | 说明                                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| `append(key, value)`                | 追加一个键值对（允许同名）                                     |
| `delete(key, value?)`               | 删除指定 key；传入 `value` 时仅删除该值的条目                  |
| `get(key)`                          | 返回首个匹配 value，无则 `null`                                |
| `getAll(key)`                       | 返回该 key 的所有 value 数组                                   |
| `has(key, value?)`                  | 是否存在；传入 `value` 时精确匹配键值                          |
| `set(key, value)`                   | 设为唯一一对（移除其余同名键，不存在则新增）                   |
| `sort()`                            | 按 key 字典序排序                                              |
| `forEach(cb, thisArg?)`             | 遍历，回调签名为 `(value, key, params)`，`this` 绑定 `thisArg` |
| `keys()` / `values()` / `entries()` | 分别返回 key / value / `[key, value]` 的迭代器                 |
| `[Symbol.iterator]()`               | 直接迭代得到 `[key, value]`                                    |
| `toString()`                        | 序列化为查询串（空格转 `+`，特殊字符 percent-encode）          |
| `size`                              | 当前键值对数量                                                 |

构造支持：查询字符串（可带 `?` 前缀）、`string[][]`、普通对象、以及另一个 `URLSearchParams` 实例。

## License

[MIT](./LICENSE)
