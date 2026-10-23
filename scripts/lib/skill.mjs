// What the repository's scripts need to know about a skill plugin: its one SKILL.md, the
// frontmatter fields Claude Code reads, and the "What it touches" block derived from them.
// A skill plugin is skills/<name>/ holding .claude-plugin/plugin.json and skills/<name>/SKILL.md.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

// Parse the flat YAML Claude Code accepts in SKILL.md frontmatter: scalars, quoted scalars,
// folded and literal blocks, flow and block lists, and one level of nested map (whose child
// keys are kept, for `hooks`). Anything else throws, so the check names the line.
export function parseFrontmatter(text) {
  const lines = text.split('\n')
  if (lines[0] !== '---') throw new Error('frontmatter must start on line 1 with ---')
  const end = lines.indexOf('---', 1)
  if (end < 0) throw new Error('frontmatter has no closing ---')
  const fm = {}
  let i = 1
  while (i < end) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith('#')) {
      i += 1
      continue
    }
    const m = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(line)
    if (!m) throw new Error(`frontmatter line ${i + 1} is not "key: value": ${line}`)
    const [, key, raw = ''] = m
    const value = raw.trim()
    const block = []
    let j = i + 1
    while (j < end && (/^\s+\S/.test(lines[j]) || !lines[j].trim())) {
      block.push(lines[j])
      j += 1
    }
    while (block.length && !block[block.length - 1].trim()) block.pop()
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      fm[key] = block.map((l) => l.trim()).join(value.startsWith('>') ? ' ' : '\n').trim()
    } else if (value === '') {
      if (!block.length) {
        fm[key] = ''
      } else if (block.every((l) => !l.trim() || /^\s+-\s/.test(l))) {
        fm[key] = block.filter((l) => l.trim()).map((l) => unquote(l.trim().slice(2)))
      } else if (block.every((l) => !l.trim() || /^\s+[A-Za-z0-9_-]+:/.test(l) || /^\s{4,}/.test(l) || /^\s+-/.test(l))) {
        fm[key] = Object.fromEntries(
          block
            .filter((l) => /^\s{1,3}[A-Za-z0-9_-]+:/.test(l))
            .map((l) => [l.trim().split(':')[0], true]),
        )
      } else {
        throw new Error(`frontmatter key "${key}" has a value this check cannot read`)
      }
    } else if (block.length && block.some((l) => l.trim())) {
      throw new Error(`frontmatter key "${key}" has both an inline value and an indented block`)
    } else if (value.startsWith('[') && value.endsWith(']')) {
      fm[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s.trim()))
        .filter(Boolean)
    } else {
      fm[key] = unquote(value)
    }
    i = j
  }
  return { frontmatter: fm, body: lines.slice(end + 1).join('\n') }
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1)
  return s
}

// The one skill a plugin under skills/ carries: skills/<name>/skills/<name>/SKILL.md.
export function readSkillPlugin(dir) {
  const name = basename(dir)
  const manifestPath = join(dir, '.claude-plugin', 'plugin.json')
  if (!existsSync(manifestPath)) throw new Error('no .claude-plugin/plugin.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const skillsDir = join(dir, 'skills')
  const skillDirs = existsSync(skillsDir) ? readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory()) : []
  const skillDir = join(skillsDir, name)
  const skillPath = join(skillDir, 'SKILL.md')
  if (!existsSync(skillPath)) throw new Error(`no skills/${name}/SKILL.md`)
  const text = readFileSync(skillPath, 'utf8')
  const { frontmatter, body } = parseFrontmatter(text)
  return { name, dir, manifest, skillDirs, skillDir, skillPath, text, frontmatter, body }
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir).sort()) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

// The lines a skill README shows under "What it touches": what the skill makes Claude do,
// read from the frontmatter and the folder, so a reviewer can compare them with the text.
export function touchesLines(skill) {
  const fm = skill.frontmatter
  const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(/\s*,\s*/) : [])
  const invokedBy =
    String(fm['disable-model-invocation']) === 'true' ? 'user only' : String(fm['user-invocable']) === 'false' ? 'Claude only' : 'user and Claude'
  const tools = list(fm['allowed-tools'])
  const removed = list(fm['disallowed-tools'])
  const runsIn = fm.context === 'fork' ? 'a subagent' + (fm.agent ? ' (' + fm.agent + ')' : '') : 'the main session'
  const hooks = fm.hooks && typeof fm.hooks === 'object' && !Array.isArray(fm.hooks) ? Object.keys(fm.hooks) : []
  const files = walk(skill.skillDir).map((p) => relative(skill.skillDir, p)).filter((p) => p !== 'SKILL.md')
  const reads = files.filter((p) => /\.md$/i.test(p))
  const bundled = files.filter((p) => !/\.md$/i.test(p))
  const shell = [...skill.body.matchAll(/!`([^`\n]+)`/g)].map((m) => m[1].trim())
  const lines = [
    'skill: ' + skill.name,
    'invoked by: ' + invokedBy,
    'tools: ' + (tools.length ? tools.join(', ') : 'none granted') + (removed.length ? '; removed: ' + removed.join(', ') : ''),
    'runs in: ' + runsIn + (fm.model ? ', model ' + fm.model : ''),
    'hooks: ' + (hooks.length ? hooks.join(', ') : 'none'),
    'reads: ' + (reads.length ? reads.join(', ') : 'nothing beside SKILL.md'),
    'bundled: ' + (bundled.length ? bundled.join(', ') : 'none'),
    'shell at load: ' + (shell.length ? shell.join(' ; ') : 'none'),
  ]
  return lines
}
