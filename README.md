# whatwg-url

零依赖、无 DOM、ES2023 的 [WHATWG URL 标准](https://url.spec.whatwg.org/) 实现 —— 和浏览器里一样的 `URL` 和 `URLSearchParams` API，可在任意 JavaScript 运行时中使用。

它使用纯 JS UTF-8 编解码，不依赖 `TextEncoder`/`TextDecoder`，因此可以运行在缺少这些全局对象的环境中 —— **小程序、嵌入式运行时、沙箱环境、以及普通 Node.js** —— 无需任何 polyfill。

## 特性

- **符合规范的解析器**：完整实现 Basic URL 解析器状态机（scheme、authority、host、port、path、query、fragment，以及所有特殊 scheme 分支）。
- **`URL` 和 `URLSearchParams`** 类，与 Web IDL 接口一致，包括：
  - 全部属性访问器：`href`、`protocol`、`username`、`password`、`host`、`hostname`、`port`、`pathname`、`search`、`searchParams`、`hash`、`origin`
  - `toString()` / `toJSON()`
  - `URL.parse(url, base?)` 和 `URL.canParse(url, base?)`（失败时返回 `null` / `false`，不抛异常）
  - 完整的 `URLSearchParams` API：`append`、`delete`、`get`、`getAll`、`has`、`set`、`sort`、`keys`、`values`、`entries`、`forEach`、`size`，以及迭代器
- **Host 解析**：支持域名（含 IDNA/punycode）、IPv4、IPv6（含 `::` 压缩）、以及 opaque host。
- **正确的 origin 序列化**（opaque origin 返回 `'null'`）。
- **表单编码**（`application/x-www-form-urlencoded`），用于查询字符串和 `URLSearchParams`。

## 安装

```sh
pnpm i @blyou/whatwg-url
```

## 使用

```ts
import { URL, URLSearchParams } from '@blyou/whatwg-url'

const u = new URL('https://user:pass@example.com:8080/a/b?q=1#frag')
u.href // "https://user:pass@example.com:8080/a/b?q=1#frag"
u.hostname // "example.com"
u.port // "8080"
u.pathname // "/a/b"
u.origin // "https://example.com:8080"

// 相对路径解析
new URL('../c', 'https://example.com/a/b/').href
// "https://example.com/a/c"

// searchParams 与 URL 双向绑定
const sp = new URLSearchParams('a=b c')
sp.toString() // "a=b+c"

// 符合规范的错误处理
URL.parse('http://') // null
URL.canParse('http://') // false
URL.parse('../x', 'http://example.com/') // URL 实例
```

## API

### `class URL`

| 成员                       | 说明                                                           |
| -------------------------- | -------------------------------------------------------------- |
| `new URL(url, base?)`      | 解析 `url`（可选相对于 `base` 解析）。失败时抛出 `TypeError`。 |
| `href`                     | 序列化后的 URL（getter/setter）。                              |
| `protocol`                 | scheme + `:`（getter/setter）。                                |
| `username` / `password`    | 用户信息部分（getter/setter）。                                |
| `host` / `hostname`        | 带/不带端口的主机名（getter/setter）。                         |
| `port`                     | 端口字符串，默认端口或空端口时为 `''`（getter/setter）。       |
| `pathname`                 | 路径（getter/setter；对 opaque path 无操作）。                 |
| `search`                   | 以 `?` 开头的查询字符串，或 `''`（getter/setter）。            |
| `searchParams`             | 与 URL 双向绑定的 `URLSearchParams`。                          |
| `hash`                     | 以 `#` 开头的 fragment，或 `''`（getter/setter）。             |
| `origin`                   | 序列化后的 origin；opaque origin 返回 `'null'`。               |
| `toString()` / `toJSON()`  | 序列化为字符串。                                               |
| `URL.parse(url, base?)`    | 类似 `new URL`，但失败时返回 `null` 而不是抛异常。             |
| `URL.canParse(url, base?)` | 输入可成功解析时返回 `true`。                                  |

### `class URLSearchParams`

| 成员                                | 说明                                             |
| ----------------------------------- | ------------------------------------------------ |
| `new URLSearchParams(init?)`        | 从查询字符串、对象、数组对、或迭代器初始化。     |
| `append(name, value)`               | 追加一个键值对。                                 |
| `delete(name, value?)`              | 按 name（或 name+value）删除。                   |
| `get(name)` / `getAll(name)`        | 获取第一个值 / 所有值。                          |
| `has(name, value?)`                 | 检查是否存在。                                   |
| `set(name, value)`                  | 替换 `name` 对应的所有值。                       |
| `sort()`                            | 按 name 排序（稳定排序）。                       |
| `keys()` / `values()` / `entries()` | 迭代器。                                         |
| `forEach(cb, thisArg?)`             | 遍历键值对。                                     |
| `size`                              | 键值对数量。                                     |
| `toString()`                        | 序列化：空格转为 `+`，不安全字符进行百分号编码。 |

## 构建

```sh
pnpm build      # tsdown -> dist/index.mjs (ESM) + dist/index.cjs (CJS) + 类型声明
```

`package.json` 同时暴露 ESM 和 CJS 入口及其类型声明。

## 测试

### 单元测试

```sh
pnpm test
```

### Web Platform Tests (WPT)

本项目集成了官方 [web-platform-tests](https://github.com/web-platform-tests/wpt) URL 测试套件，用于验证规范符合性。

WPT 测试数据**不**提交到本仓库。通过一个轻量脚本按需从 WPT 仓库下载所需的 4 个 JSON 数据文件：

```sh
# 下载 WPT URL 测试数据（urltestdata、setters、percent-encoding、toascii）
pnpm fetch:wpt

# 针对构建产物运行 WPT 测试（先构建，再测试）
pnpm test:wpt
```

下载的文件保存在 `tests/wpt-resources/`（已加入 `.gitignore`）。如需升级测试数据，修改 `scripts/fetch-wpt-resources.mjs` 中的 `WPT_REF` 常量并重新运行 `pnpm fetch:wpt`。

## 许可证

[MIT](./LICENSE)
