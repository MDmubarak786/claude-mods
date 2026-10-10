// The squares, and the pure logic that decides when each one is hit.
// No `$` in this file: it's imported by the hooks module and by the tests,
// and scripts/sync-squares.mjs reads SQUARES to generate the README table.

export type Square = { id: string; label: string; detail: string }

// label fits a cell (12 characters or fewer); detail is the README sentence.
export const SQUARES: Square[] = [
  { id: 'tests', label: 'ran tests', detail: 'A Bash command ran a test runner: npm/pnpm/yarn/bun test, pytest, go test, cargo test, jest, vitest, mocha, rspec, phpunit, make test, dotnet test, mvn test, gradle test, or ctest.' },
  { id: 'commit', label: 'git commit', detail: 'A Bash command ran `git commit`.' },
  { id: 'push', label: 'git push', detail: 'A Bash command ran `git push`.' },
  { id: 'git-look', label: 'git status', detail: 'A Bash command ran `git status`, `diff`, `log`, `show`, or `blame`.' },
  { id: 'install', label: 'installed', detail: 'A Bash command installed a package with npm, pnpm, yarn, bun, pip, uv, cargo, go get, or brew.' },
  { id: 'build', label: 'ran a build', detail: 'A Bash command ran a build or type check: npm run build, tsc, cargo build, go build, make, gradle, mvn, dotnet build, xcodebuild, or swift build.' },
  { id: 'lint', label: 'ran a linter', detail: 'A Bash command ran eslint, npm run lint, ruff, flake8, pylint, golangci-lint, cargo clippy, rubocop, or biome.' },
  { id: 'curl', label: 'curl/wget', detail: 'A Bash command used curl or wget.' },
  { id: 'docker', label: 'docker/k8s', detail: 'A Bash command used docker or kubectl.' },
  { id: 'rm', label: 'rm -r', detail: 'A Bash command ran a recursive rm.' },
  { id: 'chain', label: 'cmd && cmd', detail: 'A Bash command chained two commands with && or ||.' },
  { id: 'pipe', label: 'used a pipe', detail: 'A Bash command piped one command into another.' },
  { id: 'readme', label: 'read README', detail: 'Claude read a file whose name contains README.' },
  { id: 'read-md', label: 'read a .md', detail: 'Claude read a Markdown file.' },
  { id: 'read-config', label: 'read config', detail: 'Claude read a .json, .yaml, .yml, .toml, or .ini file.' },
  { id: 'edit-test', label: 'edited tests', detail: 'Claude edited or wrote a test file: a name with .test., .spec., or _test., or a path under tests/ or test/.' },
  { id: 'edit-md', label: 'edited .md', detail: 'Claude edited or wrote a Markdown file.' },
  { id: 'wrote-file', label: 'wrote a file', detail: 'Claude wrote a whole file with the Write tool.' },
  { id: 'notebook', label: 'notebook', detail: 'Claude edited a Jupyter notebook.' },
  { id: 'grep', label: 'used Grep', detail: 'Claude searched file contents with the Grep tool.' },
  { id: 'glob', label: 'used Glob', detail: 'Claude searched file names with the Glob tool.' },
  { id: 'web', label: 'went online', detail: 'Claude used WebFetch or WebSearch.' },
  { id: 'todo', label: 'todo list', detail: 'Claude wrote its task list with TodoWrite.' },
  { id: 'ask', label: 'asked you', detail: 'Claude asked you a question with AskUserQuestion.' },
  { id: 'mcp', label: 'MCP tool', detail: "Claude called a tool from an MCP server (not one this repository's mods add)." },
  { id: 'bash-fail', label: 'bash failed', detail: 'A Bash command exited with an error.' },
  { id: 'refused', label: 'call refused', detail: 'A mod refused a tool call, for example fence, right-tool, pkg-guard, or tripwire.' },
  { id: 'ten-tools', label: '10+ tools', detail: 'One turn made ten or more tool calls.' },
  { id: 'five-files', label: '5+ files', detail: 'One turn edited five or more different files.' },
  { id: 'same-file-3', label: 'same file ×3', detail: 'One turn edited the same file three or more times.' },
  { id: 'three-langs', label: '3 languages', detail: 'One turn edited files with three or more different extensions.' },
  { id: 'read-10', label: '10+ reads', detail: 'One turn read ten or more files.' },
  { id: 'long-turn', label: '2 min turn', detail: 'A turn took two minutes or longer.' },
  { id: 'no-tools', label: 'no tools', detail: 'Claude answered a turn without using any tool.' },
  { id: 'interrupted', label: 'interrupted', detail: 'You interrupted a turn.' },
  { id: 'long-answer', label: 'long answer', detail: 'An answer was 2,000 characters or longer.' },
  { id: 'one-liner', label: 'one-liner', detail: 'An answer was under 60 characters.' },
  { id: 'retry', label: 'retried cmd', detail: 'One turn ran the exact same Bash command twice.' },
  { id: 'night-owl', label: 'night owl', detail: 'A turn ended between 10 pm and 5 am, by your clock.' },
  { id: 'subagent', label: 'subagent', detail: 'Claude started a subagent.' },
  { id: 'compact', label: 'compaction', detail: 'The conversation was compacted.' },
  { id: 'slash', label: 'you: /cmd', detail: 'You ran a slash command (other than /bingo).' },
]

export const FREE = 12
export const CARD_SIZE = 24

const TEST_RE = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\bpytest\b|\bgo test\b|\bcargo test\b|\bjest\b|\bvitest\b|\bmocha\b|\bphpunit\b|\brspec\b|\bmake test\b|\bdotnet test\b|\bmvn (?:test|verify)\b|\bgradle(?:w)? test\b|\bctest\b|\bmix test\b/
const BUILD_RE = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|typecheck|tsc)\b|\btsc\b|\bcargo (?:build|check)\b|\bgo (?:build|vet)\b|\bmake\b(?!\s+test)|\bgradle(?:w)?\s+(?:build|assemble)\b|\bmvn (?:compile|package|install)\b|\bdotnet build\b|\bxcodebuild\b|\bswift build\b/
const LINT_RE = /\beslint\b|\b(?:npm|pnpm|yarn|bun)\s+run\s+lint\b|\bruff\b|\bflake8\b|\bpylint\b|\bgolangci-lint\b|\bcargo clippy\b|\brubocop\b|\bbiome\b/
const INSTALL_RE = /\b(?:npm|pnpm|yarn|bun)\s+(?:install|i|add)\b|\bpip3?\s+install\b|\buv\s+(?:add|pip install)\b|\bcargo add\b|\bgo get\b|\bbrew install\b/
const TEST_FILE_RE = /\.test\.|\.spec\.|_test\.|\/tests?\//i
const OWN_TOOLS_RE = /^mcp__(?:big-output)__/

// Squares a finished tool call hits. `result` is what next(e) resolved to.
export function squaresForTool(tool: string, input: Record<string, unknown>, result: { deny?: unknown; isError?: unknown }): string[] {
  const hits: string[] = []
  if (result && result.deny) hits.push('refused')
  const path = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
  switch (tool) {
    case 'Bash': {
      const c = typeof input.command === 'string' ? input.command : ''
      if (TEST_RE.test(c)) hits.push('tests')
      if (/\bgit (?:-C \S+ )?commit\b/.test(c)) hits.push('commit')
      if (/\bgit (?:-C \S+ )?push\b/.test(c)) hits.push('push')
      if (/\bgit (?:-C \S+ )?(?:status|diff|log|show|blame)\b/.test(c)) hits.push('git-look')
      if (INSTALL_RE.test(c)) hits.push('install')
      if (BUILD_RE.test(c)) hits.push('build')
      if (LINT_RE.test(c)) hits.push('lint')
      if (/\b(?:curl|wget)\b/.test(c)) hits.push('curl')
      if (/\bdocker\b|\bkubectl\b/.test(c)) hits.push('docker')
      if (/\brm\s+-[a-zA-Z]*r/.test(c)) hits.push('rm')
      if (/&&|\|\|/.test(c)) hits.push('chain')
      if (/(?<!\|)\|(?!\|)/.test(c)) hits.push('pipe')
      if (result && result.isError) hits.push('bash-fail')
      break
    }
    case 'Read':
      if (/readme/i.test(path)) hits.push('readme')
      if (/\.mdx?$/i.test(path)) hits.push('read-md')
      if (/\.(?:json|ya?ml|toml|ini)$/i.test(path)) hits.push('read-config')
      break
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      if (TEST_FILE_RE.test(path)) hits.push('edit-test')
      if (/\.mdx?$/i.test(path)) hits.push('edit-md')
      if (tool === 'Write') hits.push('wrote-file')
      break
    case 'NotebookEdit':
      hits.push('notebook')
      break
    case 'Grep':
      hits.push('grep')
      break
    case 'Glob':
      hits.push('glob')
      break
    case 'WebFetch':
    case 'WebSearch':
      hits.push('web')
      break
    case 'TodoWrite':
      hits.push('todo')
      break
    case 'AskUserQuestion':
      hits.push('ask')
      break
    default:
      if (tool.startsWith('mcp__') && !OWN_TOOLS_RE.test(tool)) hits.push('mcp')
  }
  return hits
}

// What one turn accumulates, for the squares judged when it ends.
export type TurnStats = { calls: number; reads: number; edits: Record<string, number>; bash: string[] }

export function emptyTurn(): TurnStats {
  return { calls: 0, reads: 0, edits: {}, bash: [] }
}

export function noteToolInTurn(t: TurnStats, tool: string, input: Record<string, unknown>) {
  t.calls += 1
  if (tool === 'Read') t.reads += 1
  if (tool === 'Bash' && typeof input.command === 'string') t.bash.push(input.command.trim())
  if (['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(tool)) {
    const path = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
    if (path) t.edits[path] = (t.edits[path] ?? 0) + 1
  }
}

// Squares a finished turn hits. `hour` is the local hour it ended.
export function squaresForTurn(t: TurnStats, answer: string, isAborted: boolean, durationMs: number, hour: number): string[] {
  const hits: string[] = []
  const files = Object.keys(t.edits)
  if (t.calls >= 10) hits.push('ten-tools')
  if (files.length >= 5) hits.push('five-files')
  if (Object.values(t.edits).some((n) => n >= 3)) hits.push('same-file-3')
  if (new Set(files.map((f) => f.split('.').pop()?.toLowerCase() ?? '').filter(Boolean)).size >= 3) hits.push('three-langs')
  if (t.reads >= 10) hits.push('read-10')
  if (durationMs >= 120_000) hits.push('long-turn')
  if (isAborted) hits.push('interrupted')
  else if (t.calls === 0) hits.push('no-tools')
  if (answer.length >= 2000) hits.push('long-answer')
  if (answer.trim().length > 0 && answer.trim().length < 60) hits.push('one-liner')
  if (new Set(t.bash).size < t.bash.length) hits.push('retry')
  if (hour >= 22 || hour < 5) hits.push('night-owl')
  return hits
}

// --- The card

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The same date and salt always draw the same 24 ids, in the same order.
export function drawCard(date: string, salt: number): string[] {
  const r = rng(hash(date + '#' + salt))
  const pool = SQUARES.map((s) => s.id)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }
  return pool.slice(0, CARD_SIZE)
}

// The id at a grid position, or null for FREE.
export function idAt(ids: string[], pos: number): string | null {
  if (pos === FREE) return null
  return ids[pos < FREE ? pos : pos - 1] ?? null
}

export function isMarked(ids: string[], marks: Record<string, number>, pos: number): boolean {
  const id = idAt(ids, pos)
  return id === null || id in marks
}

const LINES: [string, number[]][] = [
  ...[0, 1, 2, 3, 4].map((r): [string, number[]] => ['row ' + (r + 1), [0, 1, 2, 3, 4].map((c) => r * 5 + c)]),
  ...[0, 1, 2, 3, 4].map((c): [string, number[]] => ['column ' + (c + 1), [0, 1, 2, 3, 4].map((r) => r * 5 + c)]),
  ['diagonal ↘', [0, 6, 12, 18, 24]],
  ['diagonal ↗', [4, 8, 12, 16, 20]],
]

export function completedLines(ids: string[], marks: Record<string, number>): string[] {
  return LINES.filter(([, cells]) => cells.every((p) => isMarked(ids, marks, p))).map(([name]) => name)
}

export function labelOf(id: string): string {
  return SQUARES.find((s) => s.id === id)?.label ?? id
}

export function dayOf(ms: number): string {
  const d = new Date(ms)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
