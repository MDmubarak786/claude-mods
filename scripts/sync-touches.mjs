#!/usr/bin/env node
// Keep each mod README's "What it touches" block identical to what `claude plugin validate` prints.
// Usage: node scripts/sync-touches.mjs            rewrite every mod's block
//        node scripts/sync-touches.mjs --check    exit 1 if any block differs
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
let failed = 0

for (const name of readdirSync(join(root, 'mods')).sort()) {
  const dir = join(root, 'mods', name)
  let out = ''
  try {
    out = execFileSync('claude', ['plugin', 'validate', dir], { encoding: 'utf8' })
  } catch (error) {
    out = String(error.stdout ?? '')
  }
  const lines = out.split('\n').map((l) => l.trim())
  const hooks = lines.find((l) => /^❯ \S+ hooks: /.test(l))?.replace(/^❯ \S+ /, '')
  const calls = lines.find((l) => /^❯ \S+ calls: /.test(l))?.replace(/^❯ \S+ /, '')
  if (!hooks || !calls) {
    console.error(name + ': could not read hooks/calls from validate')
    failed = 1
    continue
  }
  const expected = '```text\n' + hooks + '\n' + calls + '\n```'
  const readmePath = join(dir, 'README.md')
  const readme = readFileSync(readmePath, 'utf8')
  const re = /(## What it touches\n\n(?:[^\n]*\n\n)?)```text\n[\s\S]*?\n```/
  const m = re.exec(readme)
  if (!m) {
    console.error(name + ': README has no fenced block under "## What it touches"')
    failed = 1
    continue
  }
  const current = m[0].slice(m[1].length)
  if (current === expected) continue
  if (check) {
    console.error(name + ': README "What it touches" block differs from validate output')
    failed = 1
  } else {
    writeFileSync(readmePath, readme.replace(re, (_, lead) => lead + expected))
    console.log(name + ': updated')
  }
}
if (check && !failed) console.log('every README "What it touches" block matches validate')
process.exit(failed)
