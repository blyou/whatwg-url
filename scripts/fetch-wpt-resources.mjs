import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

// Pin a specific WPT commit to avoid version drift.
// To upgrade test data, update this sha and re-run `pnpm fetch:wpt`.
const WPT_REF = 'master'
const BASE = `https://raw.githubusercontent.com/web-platform-tests/wpt/${WPT_REF}/url/resources`
const OUT_DIR = resolve(import.meta.dirname, '../tests/wpt-resources')

const files = ['urltestdata.json', 'setters_tests.json', 'percent-encoding.json', 'toascii.json']

await mkdir(OUT_DIR, { recursive: true })
for (const f of files) {
  const res = await fetch(`${BASE}/${f}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${f}: ${res.status} ${res.statusText}`)
  }
  const text = await res.text()
  await writeFile(resolve(OUT_DIR, f), text, 'utf8')
  console.log(`\u2713 ${f} (${text.length} bytes)`)
}
console.log(`WPT resources downloaded to ${OUT_DIR}`)
