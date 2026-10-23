#!/usr/bin/env node
// Add one entry to .claude-plugin/marketplace.json, keeping the list sorted by name.
// Usage: node scripts/lib/add-catalog-entry.mjs <name> <source> "<description>" [tag ...]
// Shared by scripts/new-mod.sh and scripts/new-skill.sh.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [name, source, description, ...tags] = process.argv.slice(2)
if (!name || !source || !description) {
  console.error('usage: node scripts/lib/add-catalog-entry.mjs <name> <source> "<description>" [tag ...]')
  process.exit(2)
}
const file = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude-plugin', 'marketplace.json')
const marketplace = JSON.parse(readFileSync(file, 'utf8'))
if (marketplace.plugins.some((p) => p.name === name)) {
  console.error(`error: marketplace already lists ${name}`)
  process.exit(1)
}
marketplace.plugins.push({ name, source, description, category: 'other', tags })
marketplace.plugins.sort((a, b) => a.name.localeCompare(b.name))
writeFileSync(file, JSON.stringify(marketplace, null, 2) + '\n')
