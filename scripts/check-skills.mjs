#!/usr/bin/env node
// The checks CI runs on a skill plugin, since `claude plugin test` only runs a hooks module's tests.
// Usage: node scripts/check-skills.mjs [skills/<name> ...]   every skill when none is given
// Exits 1 when any check fails. It never writes.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter, readSkillPlugin } from './lib/skill.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_DESCRIPTION = 1536 // Claude Code cuts description + when_to_use here in the skill listing.
const MAX_LINES = 500 // The skills docs' recommended ceiling for SKILL.md.
const README_HEADINGS = ['## Install', '## Use it', '## What it touches', '## Tested with', '## Limitations', '## License']

let dirs = process.argv.slice(2).map((d) => resolve(d.replace(/\/$/, '')))
if (!dirs.length) {
  const skillsRoot = join(root, 'skills')
  dirs = existsSync(skillsRoot)
    ? readdirSync(skillsRoot)
        .filter((d) => statSync(join(skillsRoot, d)).isDirectory())
        .sort()
        .map((d) => join(skillsRoot, d))
    : []
}

let failed = 0
for (const dir of dirs) {
  const problems = []
  const name = basename(dir)
  try {
    const skill = readSkillPlugin(dir)
    const fm = skill.frontmatter
    if (skill.manifest.name !== name) problems.push(`plugin.json name is "${skill.manifest.name}", folder is "${name}"`)
    if (skill.skillDirs.length !== 1 || skill.skillDirs[0] !== name) problems.push(`skills/ must hold exactly one folder named ${name} (found: ${skill.skillDirs.join(', ') || 'none'})`)
    if (fm.name !== undefined && fm.name !== name) problems.push(`SKILL.md name is "${fm.name}", folder is "${name}"`)
    if (!fm.description || !String(fm.description).trim()) problems.push('SKILL.md has no description; Claude cannot decide when to invoke it')
    const listing = String(fm.description ?? '') + ' ' + String(fm.when_to_use ?? '')
    if (listing.trim().length > MAX_DESCRIPTION) problems.push(`description + when_to_use is ${listing.trim().length} characters; the listing cuts it at ${MAX_DESCRIPTION}`)
    const lineCount = skill.text.split('\n').length
    if (lineCount > MAX_LINES) problems.push(`SKILL.md is ${lineCount} lines; keep it under ${MAX_LINES} and move detail to files beside it`)
    for (const m of skill.body.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1]
      if (/^(https?:|mailto:|#|\/)/.test(target)) continue
      const path = resolve(skill.skillDir, target.split('#')[0])
      if (!path.startsWith(skill.skillDir + '/') && path !== skill.skillDir) problems.push(`link ${target} leaves the skill folder`)
      else if (!existsSync(path)) problems.push(`link ${target} points at a file that does not exist`)
    }
    for (const forbidden of ['CLAUDE.md', 'tests', 'hooks']) {
      if (existsSync(join(dir, forbidden))) problems.push(`${forbidden} does not belong in a skill plugin`)
    }
    const readmePath = join(dir, 'README.md')
    if (!existsSync(readmePath)) problems.push('no README.md')
    else {
      const readme = readFileSync(readmePath, 'utf8')
      if (!readme.startsWith('# ' + name + '\n')) problems.push(`README.md must start with "# ${name}"`)
      for (const heading of README_HEADINGS) {
        if (!readme.split('\n').includes(heading)) problems.push(`README.md has no "${heading}" section`)
      }
      if (/__NAME__|__DESCRIPTION__|__AUTHOR__|X\.Y\.Z/.test(readme)) problems.push('README.md still has template placeholders')
    }
    if (/__NAME__|__DESCRIPTION__/.test(skill.text)) problems.push('SKILL.md still has template placeholders')
    problems.push(...checkEvals(dir, name))
  } catch (error) {
    problems.push(String(error.message ?? error))
  }
  if (problems.length) {
    failed = 1
    for (const p of problems) console.error(`skills/${name}: ${p}`)
  } else {
    console.log(`skills/${name}: ok`)
  }
}
if (!dirs.length) console.log('no skills under skills/')
process.exit(failed)

// Every skill ships the eval cases that show it triggers on the right prompt and not on a
// neighbouring one. CI only checks they exist; `claude plugin eval` runs them on the author's account.
function checkEvals(dir, name) {
  const problems = []
  const evals = join(dir, 'evals')
  if (!existsSync(evals)) return ['no evals/ folder: add a should-trigger and a must-not-trigger case']
  const cases = []
  const visit = (d) => {
    for (const entry of readdirSync(d).sort()) {
      const p = join(d, entry)
      if (!statSync(p).isDirectory() || entry === 'results' || entry === 'mocks') continue
      if (existsSync(join(p, 'prompt.md')) || existsSync(join(p, 'case.yaml'))) cases.push(p)
      else visit(p)
    }
  }
  visit(evals)
  if (!cases.length) return ['evals/ has no case (a folder with prompt.md)']
  let fires = 0
  let silent = 0
  for (const c of cases) {
    const gradersDir = join(c, 'graders')
    const graders = existsSync(gradersDir) ? readdirSync(gradersDir).filter((f) => f.endsWith('.md')) : []
    if (!graders.length) problems.push(`evals/${basename(c)} has no graders/*.md`)
    const prompt = join(c, 'prompt.md')
    if (existsSync(prompt)) {
      const body = parseFrontmatter(readFileSync(prompt, 'utf8')).body
      if (!body.replace(/<!--[\s\S]*?-->/g, '').trim()) problems.push(`evals/${basename(c)}/prompt.md has no prompt`)
    }
    for (const g of graders) {
      const fm = parseFrontmatter(readFileSync(join(gradersDir, g), 'utf8')).frontmatter
      if (fm.type !== 'tool_used' || fm.tool !== 'Skill') continue
      if (!String(fm.input_match ?? '').includes(name)) problems.push(`evals/${basename(c)}/graders/${g} does not name ${name} in input_match`)
      if (String(fm.min) === '0' && String(fm.max) === '0') silent += 1
      else fires += 1
    }
  }
  if (!fires) problems.push('no eval case with a tool_used: Skill grader that expects the skill to fire')
  if (!silent) problems.push('no eval case with a tool_used: Skill grader set to min: 0, max: 0 (a prompt the skill must leave alone)')
  return problems
}
