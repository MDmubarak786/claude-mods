// trust-but-verify: check what Claude claims against what it ran.
//
//   /claims          show the verdicts from this session
//   /claims off|on   hide or show the verdict line
//
// When an answer claims the tests pass, the build is clean, lint is clean,
// something was committed or pushed, or something was "verified", a line
// under the answer says whether a matching command actually ran this turn
// and succeeded. The line is for you; Claude doesn't read it. No follow-up
// turn is started.

type Call = { tool: string; command: string; isError: boolean }
type Claim = { name: string; claim: RegExp; evidence: RegExp }

const CLAIMS: Claim[] = [
  { name: 'tests pass', claim: /\b(?:all |the )?tests? (?:now |all |are |is )?(?:pass(?:es|ing)?|green|succeed(?:s|ed)?)\b|\btest suite (?:passes|is green)\b|\bran the tests?\b/i, evidence: /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\bpytest\b|\bgo test\b|\bcargo test\b|\bjest\b|\bvitest\b|\bmocha\b|\bphpunit\b|\brspec\b|\bmake test\b|\bdotnet test\b|\bmvn (?:test|verify)\b|\bgradle(?:w)? test\b|\bctest\b|\bbundle exec rspec\b|\bmix test\b/ },
  { name: 'build succeeds', claim: /\b(?:build|builds|compiles?|compiled)\s+(?:succeeds|successfully|passes|cleanly|fine|without errors)\b|\bbuilt successfully\b|\btype-?checks? (?:pass|passes|clean)\b/i, evidence: /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|typecheck|tsc)\b|\btsc\b|\bcargo (?:build|check)\b|\bgo (?:build|vet)\b|\bmake\b(?!\s+test)|\bgradle(?:w)?\s+(?:build|assemble)\b|\bmvn (?:compile|package|install)\b|\bdotnet build\b|\bxcodebuild\b|\bswift build\b/ },
  { name: 'lint is clean', claim: /\blint(?:er|ing)? (?:passes|is clean|clean|succeeds)\b|\bno lint (?:errors|warnings)\b/i, evidence: /\beslint\b|\b(?:npm|pnpm|yarn|bun)\s+run\s+lint\b|\bruff\b|\bflake8\b|\bpylint\b|\bgolangci-lint\b|\bcargo clippy\b|\brubocop\b|\bbiome\b|\bprettier --check\b/ },
  { name: 'committed', claim: /\b(?:I|changes?|it|this)(?:'ve| have)? (?:been )?committed\b|\bcommitted (?:the|these|those|my) (?:changes?|fix|work)\b/i, evidence: /\bgit (?:-C \S+ )?commit\b/ },
  { name: 'pushed', claim: /\bpushed (?:to|the|my|it|them|this|everything|up)\b|\b(?:I(?:'ve| have)? |changes? (?:have |has )?(?:been )?)pushed\b/i, evidence: /\bgit (?:-C \S+ )?push\b/ },
]
const VERIFIED = /\b(?:I(?:'ve| have)? )?(?:verified|confirmed|validated|double-checked)\b(?! that you| with you)/i

let enabled = true
let calls: Call[] = []
const verdicts: string[] = []

function reset() {
  calls = []
}

function commandOf(e): string {
  if (e.tool === 'Bash') return String(e.command ?? '')
  return ''
}

function judge(answer: string): string[] {
  const lines: string[] = []
  for (const c of CLAIMS) {
    if (!c.claim.test(answer)) continue
    const matching = calls.filter((x) => x.tool === 'Bash' && c.evidence.test(x.command))
    if (!matching.length) lines.push('✘ claims ' + c.name + ', but no matching command ran this turn')
    else if (matching.every((x) => x.isError)) lines.push('✘ claims ' + c.name + ', but `' + shorten(matching[matching.length - 1].command) + '` failed')
    else lines.push('✔ ' + c.name + ', backed by `' + shorten(matching.filter((x) => !x.isError).pop()!.command) + '`')
  }
  if (VERIFIED.test(answer) && !lines.length) {
    const ran = calls.filter((x) => x.tool === 'Bash' || x.tool === 'Read' || x.tool === 'Grep' || x.tool === 'Glob' || x.tool.startsWith('mcp__'))
    lines.push(ran.length ? '· says "verified"; ' + ran.length + ' tool call(s) ran this turn, judge for yourself' : '✘ says "verified", but no command or read ran this turn')
  }
  return lines
}

function shorten(command: string): string {
  const one = command.replace(/\s+/g, ' ').trim()
  return one.length > 60 ? one.slice(0, 59) + '…' : one
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      enabled = (await $.store.get('enabled')) !== false
    } catch {
      enabled = true
    }
    try {
      await $.command.register({ name: 'claims', description: 'Show whether answers that claim tests pass or builds succeed were backed by a command', argumentHint: '[on | off]' })
    } catch (error) {
      $.ui.log('could not register /claims: ' + error)
    }
    return next(e)
  })

  on('command.run', { command: 'claims' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'on' || args === 'off') {
      enabled = args === 'on'
      await $.store.set('enabled', enabled)
      return { text: enabled ? 'trust-but-verify on.' : 'trust-but-verify off. No verdict lines.' }
    }
    return { text: (enabled ? 'trust-but-verify on' : 'trust-but-verify off') + '. Verdicts this session:\n' + (verdicts.length ? verdicts.map((v) => '  ' + v).join('\n') : '  none yet') }
  }).catch(async () => ({ text: 'trust-but-verify: the command failed, so nothing changed.' }))

  on('turn.start', async ($, e, next) => {
    if (typeof e.agentId !== 'string') reset()
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (typeof e.agentId !== 'string' && !result.deny) calls.push({ tool: e.tool, command: commandOf(e), isError: result.isError === true })
    return result
  }).catch(async ($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (!enabled || typeof e.agentId === 'string' || e.isAborted || typeof e.answer !== 'string') return next(e)
    const lines = judge(e.answer)
    reset()
    if (!lines.length) return next(e)
    verdicts.push(...lines)
    return { text: 'trust-but-verify: ' + lines.join('\n' + ' '.repeat(18)) }
  }).catch(async ($, e, next) => next(e))
}
