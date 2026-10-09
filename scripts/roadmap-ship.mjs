#!/usr/bin/env node
// Move a mod from the roadmap's wanted list to its "already in the catalog" line.
// Usage: node scripts/roadmap-ship.mjs <name> [<name>...]
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'roadmap.md')
let s = readFileSync(file, 'utf8')
for (const name of process.argv.slice(2)) {
  const start = s.search(new RegExp('^## \\d+\\. `' + name + '`', 'm'))
  if (start < 0) {
    console.error('no roadmap section for ' + name)
    process.exit(1)
  }
  const rest = s.slice(start + 1)
  const endRel = rest.search(/^## /m)
  s = s.slice(0, start) + (endRel < 0 ? '' : rest.slice(endRel))
  s = s.replace(/^(Already in the catalog: .*?)\.$/m, (line, list) => list + ', [`' + name + '`](../mods/' + name + '/).')
}
// Renumber the remaining entries.
let n = 0
s = s.replace(/^## \d+\. /gm, () => '## ' + ++n + '. ')
writeFileSync(file, s)
console.log('roadmap updated: ' + n + ' entries remain')
