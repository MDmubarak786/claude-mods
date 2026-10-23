#!/usr/bin/env node
// Keep each README's "What it touches" block identical to what the code says:
//   - a mod's block is the hooks: and calls: lines `claude plugin validate` prints
//   - a skill's block is read from its SKILL.md frontmatter and folder (scripts/lib/skill.mjs)
// Usage: node scripts/sync-touches.mjs            rewrite every block
//        node scripts/sync-touches.mjs --check    exit 1 if any block differs
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSkillPlugin, touchesLines } from './lib/skill.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
let failed = 0

function modLines(dir) {
  let out = ''
  try {
    out = execFileSync('claude', ['plugin', 'validate', dir], { encoding: 'utf8' })
  } catch (error) {
    out = String(error.stdout ?? '')
  }
  const lines = out.split('\n').map((l) => l.trim())
  const hooks = lines.find((l) => /^❯ \S+ hooks: /.test(l))?.replace(/^❯ \S+ /, '')
  const calls = lines.find((l) => /^❯ \S+ calls: /.test(l))?.replace(/^❯ \S+ /, '')
  if (!hooks || !calls) throw new Error('could not read hooks/calls from validate')
  return [hooks, calls]
}

function plugins(kind) {
  const base = join(root, kind)
  if (!existsSync(base)) return []
  // A folder left behind by a branch switch (only gitignored generated types) is not a plugin.
  return readdirSync(base)
    .sort()
    .map((name) => ({ name, kind, label: kind + '/' + name, dir: join(base, name) }))
    .filter((p) => existsSync(join(p.dir, '.claude-plugin', 'plugin.json')))
}

for (const plugin of [...plugins('mods'), ...plugins('skills')]) {
  let lines
  try {
    lines = plugin.kind === 'skills' ? touchesLines(readSkillPlugin(plugin.dir)) : modLines(plugin.dir)
  } catch (error) {
    console.error(plugin.label + ': ' + error.message)
    failed = 1
    continue
  }
  const expected = '```text\n' + lines.join('\n') + '\n```'
  const readmePath = join(plugin.dir, 'README.md')
  const readme = readFileSync(readmePath, 'utf8')
  const re = /(## What it touches\n\n(?:[^\n]*\n\n)?)```text\n[\s\S]*?\n```/
  const m = re.exec(readme)
  if (!m) {
    console.error(plugin.label + ': README has no fenced block under "## What it touches"')
    failed = 1
    continue
  }
  const current = m[0].slice(m[1].length)
  if (current === expected) continue
  if (check) {
    console.error(plugin.label + ': README "What it touches" block differs from what the code says')
    failed = 1
  } else {
    writeFileSync(readmePath, readme.replace(re, (_, lead) => lead + expected))
    console.log(plugin.label + ': updated')
  }
}
if (check && !failed) console.log('every README "What it touches" block matches the code')
process.exit(failed)
