#!/usr/bin/env node
// Regenerates the mods table in README.md from .claude-plugin/marketplace.json.
// Usage: node scripts/update-readme.mjs          rewrite README.md
//        node scripts/update-readme.mjs --check  exit 1 if README.md is stale
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const marketplace = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8'))

const rows = marketplace.plugins
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((entry) => {
    const dir = entry.source.replace(/^\.\//, '')
    let version = ''
    try {
      version = JSON.parse(readFileSync(join(root, dir, '.claude-plugin/plugin.json'), 'utf8')).version ?? ''
    } catch {
      // A mod without a manifest has no version to show.
    }
    const description = (entry.description ?? '').replace(/\|/g, '\\|')
    return `| [\`${entry.name}\`](${dir}/) | ${description} | ${version} |`
  })

const table = [
  '<!-- mods:start -->',
  '<!-- This table is generated from .claude-plugin/marketplace.json by scripts/update-readme.mjs. Do not edit by hand. -->',
  '| Mod | What it does | Version |',
  '| :-- | :-- | :-- |',
  ...rows,
  '<!-- mods:end -->',
].join('\n')

const readmePath = join(root, 'README.md')
const readme = readFileSync(readmePath, 'utf8')
const pattern = /<!-- mods:start -->[\s\S]*?<!-- mods:end -->/
if (!pattern.test(readme)) {
  console.error('README.md has no <!-- mods:start --> ... <!-- mods:end --> block')
  process.exit(1)
}
const next = readme.replace(pattern, table)

if (process.argv.includes('--check')) {
  if (next !== readme) {
    console.error('README.md mods table is stale. Run: node scripts/update-readme.mjs')
    process.exit(1)
  }
  console.log('README.md mods table is up to date')
} else {
  writeFileSync(readmePath, next)
  console.log(`README.md mods table updated (${rows.length} mods)`)
}
