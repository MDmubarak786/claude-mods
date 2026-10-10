#!/usr/bin/env node
// Keep the bingo README's square table identical to SQUARES in mods/tool-bingo/hooks/squares.ts.
// Usage: node scripts/sync-squares.mjs            rewrite the table
//        node scripts/sync-squares.mjs --check    exit 1 if it differs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { SQUARES } = await import(pathToFileURL(join(root, 'mods/tool-bingo/hooks/squares.ts')).href)
const readmePath = join(root, 'mods/tool-bingo/README.md')
const readme = readFileSync(readmePath, 'utf8')
const table = [
  '<!-- squares:start -->',
  '<!-- Generated from hooks/squares.ts by scripts/sync-squares.mjs. Do not edit by hand. -->',
  '| Square | Marked when |',
  '| :-- | :-- |',
  ...SQUARES.map((s) => '| `' + s.label + '` | ' + s.detail.replace(/\|/g, '\\|') + ' |'),
  '<!-- squares:end -->',
].join('\n')
const re = /<!-- squares:start -->[\s\S]*?<!-- squares:end -->/
if (!re.test(readme)) {
  console.error('mods/tool-bingo/README.md has no <!-- squares:start --> ... <!-- squares:end --> block')
  process.exit(1)
}
const next = readme.replace(re, () => table)
if (process.argv.includes('--check')) {
  if (next !== readme) {
    console.error('mods/tool-bingo/README.md square table is stale. Run: node scripts/sync-squares.mjs')
    process.exit(1)
  }
  console.log('bingo square table is up to date (' + SQUARES.length + ' squares)')
} else {
  writeFileSync(readmePath, next)
  console.log('bingo square table updated (' + SQUARES.length + ' squares)')
}
