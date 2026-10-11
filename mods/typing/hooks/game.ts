// The rules of the typing race, pure: no `$` here, so the tests and the hooks
// module share one implementation.

import type { Game, Run, Stats } from '../types'

export const HISTORY = 10

// Lines of code to type: plain ASCII, one line each, nothing longer than 72 columns.
export const SNIPPETS: string[] = [
  'const total = items.reduce((sum, item) => sum + item.price, 0)',
  'for (let i = 0; i < rows.length; i++) rows[i].visited = false',
  'if (!user || user.role !== "admin") return res.status(403).end()',
  'export default function App() { return <Main title="Home" /> }',
  'const [count, setCount] = useState<number>(0)',
  'await fs.promises.writeFile(path, JSON.stringify(data, null, 2))',
  'def fib(n): return n if n < 2 else fib(n - 1) + fib(n - 2)',
  'with open("config.yml") as f: config = yaml.safe_load(f)',
  'result = [x * x for x in range(10) if x % 2 == 0]',
  'class Point: def __init__(self, x, y): self.x, self.y = x, y',
  'SELECT name, count(*) FROM orders GROUP BY name ORDER BY 2 DESC',
  'git commit -am "Fix the off-by-one in the pager" && git push',
  'docker run --rm -it -p 8080:80 -v "$PWD":/app nginx:alpine',
  'curl -s https://api.example.com/v1/users | jq ".[] | .email"',
  'let xs: Vec<u32> = (1..=10).filter(|x| x % 3 == 0).collect();',
  'func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {',
  'public static void main(String[] args) { System.out.println("hi"); }',
  'let mut guard = mutex.lock().unwrap(); *guard += 1;',
  'match value { Some(v) => v, None => return Err(Error::Missing) }',
  'type Props = { title: string; onClose?: () => void }',
  'const debounced = useMemo(() => debounce(save, 300), [save])',
  'kubectl get pods -n prod -o wide | grep -v Running',
  'ssh -i ~/.ssh/id_ed25519 deploy@10.0.0.4 "sudo systemctl restart api"',
  'printf "%-20s %8.2f\\n" "$name" "$amount" >> report.txt',
]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// The snippet for a seed, never the one just typed.
export function pickSnippet(seed: number, avoid: number): number {
  const n = SNIPPETS.length
  let i = hash(seed + ':snippet') % n
  if (i === avoid) i = (i + 1) % n
  return i
}

export function newGame(seed: number, prev: Game | null): Game {
  return { seed, snippet: pickSnippet(seed, prev ? prev.snippet : -1), typed: '', startedAt: null, result: null, history: prev?.history ?? [], stats: prev?.stats ?? { runs: 0, bestWpm: 0 } }
}

export function target(g: Game): string {
  return SNIPPETS[g.snippet] ?? ''
}

// Each character of the target as typed so far: right, wrong, or not yet.
export type Mark = 'right' | 'wrong' | 'todo'
export function marks(g: Game): Mark[] {
  const t = target(g)
  return t.split('').map((ch, i) => (i >= g.typed.length ? 'todo' : g.typed[i] === ch ? 'right' : 'wrong'))
}

// A keystroke. The clock starts at the first character.
export function type(g: Game, value: string, now: number): Game {
  if (g.result) return g
  const startedAt = g.startedAt ?? (value.length ? now : null)
  return { ...g, typed: value, startedAt }
}

// Words per minute on the standard five-character word, counting only the
// characters typed right; accuracy is right characters over the longer of the
// target and what was typed, so extra characters past the end count against you.
export function score(g: Game, now: number): Run | null {
  if (!g.startedAt || !g.typed.length) return null
  const t = target(g)
  const right = marks(g).filter((m) => m === 'right').length
  const ms = Math.max(1, now - g.startedAt)
  const wpm = Math.round((right / 5) / (ms / 60000))
  const accuracy = Math.round((right / Math.max(t.length, g.typed.length)) * 100)
  return { wpm, accuracy, ms, chars: t.length, at: now }
}

export type FinishResult = { game: Game; error?: string }

export function finish(g: Game, now: number): FinishResult {
  if (g.result) return { game: g, error: 'This run is scored. Press n for the next line.' }
  if (!g.typed.length) return { game: g, error: 'Type the line first.' }
  // A run is scored on the whole line, so a fast fragment can't set the record.
  if (g.typed.length < target(g).length) return { game: g, error: 'Finish the line first: ' + (target(g).length - g.typed.length) + ' to go.' }
  const run = score(g, now)
  if (!run) return { game: g, error: 'Type the line first.' }
  const history = [run, ...g.history].slice(0, HISTORY)
  const stats: Stats = { runs: g.stats.runs + 1, bestWpm: Math.max(g.stats.bestWpm, run.wpm) }
  return { game: { ...g, result: run, history, stats } }
}

export function isRun(x: unknown): x is Run {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return ['wpm', 'accuracy', 'ms', 'chars', 'at'].every((k) => typeof r[k] === 'number')
}

export function isGame(x: unknown): x is Game {
  if (!x || typeof x !== 'object') return false
  const g = x as Record<string, unknown>
  const stats = g.stats as Record<string, unknown> | undefined
  return typeof g.seed === 'number' && Number.isInteger(g.snippet) && (g.snippet as number) >= 0 && (g.snippet as number) < SNIPPETS.length &&
    typeof g.typed === 'string' && (g.startedAt === null || typeof g.startedAt === 'number') && (g.result === null || isRun(g.result)) &&
    Array.isArray(g.history) && g.history.every(isRun) && !!stats && typeof stats === 'object' && ['runs', 'bestWpm'].every((k) => Number.isInteger(stats[k]))
}
