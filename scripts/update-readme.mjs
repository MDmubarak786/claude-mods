#!/usr/bin/env node
// Regenerates the lists that mirror .claude-plugin/marketplace.json:
//   - the mods table in README.md, between <!-- mods:start --> and <!-- mods:end -->
//   - the mod dropdowns in .github/ISSUE_TEMPLATE/*.yml, between "# mods:start" and "# mods:end"
// Usage: node scripts/update-readme.mjs          rewrite them
//        node scripts/update-readme.mjs --check  exit 1 if any is stale
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const marketplace = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8'))
const entries = marketplace.plugins.slice().sort((a, b) => a.name.localeCompare(b.name))

// --- README table
const rows = entries.map((entry) => {
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

const targets = []
const readmePath = join(root, 'README.md')
const readme = readFileSync(readmePath, 'utf8')
const tablePattern = /<!-- mods:start -->[\s\S]*?<!-- mods:end -->/
if (!tablePattern.test(readme)) {
  console.error('README.md has no <!-- mods:start --> ... <!-- mods:end --> block')
  process.exit(1)
}
targets.push({ path: readmePath, label: 'README.md mods table', before: readme, after: readme.replace(tablePattern, table) })

// --- Issue form dropdowns
const formsDir = join(root, '.github', 'ISSUE_TEMPLATE')
for (const file of readdirSync(formsDir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
  const path = join(formsDir, file)
  const before = readFileSync(path, 'utf8')
  const after = before.replace(/^([ \t]*)# mods:start\n[\s\S]*?^[ \t]*# mods:end$/gm, (_, indent) =>
    [indent + '# mods:start', ...entries.map((e) => indent + '- ' + e.name), indent + '# mods:end'].join('\n'),
  )
  if (after !== before || /# mods:start/.test(before)) targets.push({ path, label: '.github/ISSUE_TEMPLATE/' + file + ' mod list', before, after })
}

let stale = 0
for (const t of targets) {
  if (t.after === t.before) continue
  if (check) {
    console.error(t.label + ' is stale. Run: node scripts/update-readme.mjs')
    stale = 1
  } else {
    writeFileSync(t.path, t.after)
  }
}
if (check) {
  if (!stale) console.log('README table and issue-form mod lists are up to date')
  process.exit(stale)
}
console.log('README table and issue-form mod lists updated (' + entries.length + ' mods)')
