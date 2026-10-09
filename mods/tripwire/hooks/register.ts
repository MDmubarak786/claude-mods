// tripwire: stop secrets leaving the machine.
//
//   /tripwire        show whether it's on and what it caught this session
//   /tripwire off    let everything through
//   /tripwire on     turn it back on
//
// Three things are held, with a question whose default answer is refuse:
//   1. An Edit, Write, or Bash command whose text contains a credential:
//      an AWS, GitHub, Slack, Stripe, OpenAI, Anthropic, or Google key, a
//      private key block, a JWT, or an assignment of a long literal to a
//      name like password, secret, token, or api_key.
//   2. A Bash command that reads a secret file (.env, a private key, a
//      credentials file) and also talks to the network or encodes output.
//   3. A git commit whose staged changes add a credential or stage a secret file.
// The secret itself is never printed: Claude and the transcript see the
// pattern's name and the line, with the value masked.

type Hit = { what: string; line: number }

const SECRETS: [string, RegExp][] = [
  ['an AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['an AWS secret key', /aws_secret_access_key\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}\b/i],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/],
  ['a Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['a Stripe live key', /\b[sr]k_live_[A-Za-z0-9]{20,}\b/],
  ['an OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['an Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ['a Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['a private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----/],
  ['a JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['a credential assigned as a literal', /\b(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\b\s*[=:]\s*['"]([^'"\s]{12,})['"]/i],
]
// Values that look like placeholders, not secrets.
const PLACEHOLDER = /example|placeholder|your[-_ ]|xxx|<[^>]+>|\$\{|\$[A-Z_]|changeme|dummy|redacted|\.\.\./i

const SECRET_FILE = /(?:^|[\s"'=/@:])(?:\.env(?:\.[\w.-]+)?|id_rsa|id_ed25519|id_ecdsa|[\w.-]+\.pem|[\w.-]+\.p12|[\w.-]+\.pfx|credentials(?:\.json)?|\.netrc|\.npmrc|\.pypirc|service-account[\w.-]*\.json)\b/
const NETWORK = /\b(?:curl|wget|nc|ncat|netcat|ssh|scp|rsync|sftp|ftp|telnet|base64|openssl\s+enc|python[23]?\s+-c|node\s+-e)\b/

let enabled = true
const caught: string[] = []

function findSecret(text: string): Hit | null {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const [what, re] of SECRETS) {
      const m = re.exec(lines[i])
      if (!m) continue
      if (what === 'a credential assigned as a literal' && PLACEHOLDER.test(m[1] ?? '')) continue
      return { what, line: i + 1 }
    }
  }
  return null
}

function isExfil(command: string): boolean {
  return SECRET_FILE.test(command) && NETWORK.test(command)
}

function isCommit(command: string): boolean {
  return /\bgit\s+(?:-C\s+\S+\s+)?commit\b/.test(command)
}

async function stagedHit($): Promise<string | null> {
  try {
    const names = await $.process.run(['git', 'diff', '--cached', '--name-only'])
    for (const name of names.stdout.split('\n')) {
      if (name && SECRET_FILE.test(name) && !/\.example$|\.sample$|\.template$/.test(name)) return 'stages the secret file ' + name
    }
    const diff = await $.process.run(['git', 'diff', '--cached', '--unified=0'])
    const added = diff.stdout.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n')
    const hit = findSecret(added)
    return hit ? 'adds ' + hit.what + ' in the staged changes' : null
  } catch (error) {
    throw new Error('could not read the staged changes: ' + error)
  }
}

async function hold($, what: string, advice: string) {
  caught.push(what)
  let answer = 'Refuse'
  try {
    answer = await $.ui.ask('tripwire: this ' + what + '. Continue?', ['Refuse', 'Allow once'])
  } catch {
    // Nobody to ask: refuse.
  }
  if (answer === 'Allow once') return null
  return { deny: 'tripwire: refused because this ' + what + '. ' + advice }
}

async function guard($, e, next) {
  if (!enabled) return next(e)
  if (e.tool === 'Bash') {
    const command = String(e.command ?? '')
    const secret = findSecret(command)
    if (secret) {
      const d = await hold($, 'command contains ' + secret.what, 'Never put a credential on a command line. Read it from an environment variable or a secret manager, and ask the user if you do not know where it lives.')
      if (d) return d
    }
    if (isExfil(command)) {
      const d = await hold($, 'command reads a secret file and talks to the network', 'Do not send secret files anywhere. If the user needs this, they can do it themselves.')
      if (d) return d
    }
    if (isCommit(command)) {
      const why = await stagedHit($)
      if (why) {
        const d = await hold($, 'commit ' + why, 'Unstage the secret, move it to an environment variable or a .gitignored file, and commit again.')
        if (d) return d
      }
    }
    return next(e)
  }
  const text = e.tool === 'Write' ? String(e.content ?? '') : e.tool === 'MultiEdit' ? (Array.isArray(e.edits) ? e.edits.map((x) => x.new_string ?? '').join('\n') : '') : String(e.new_string ?? '')
  const hit = findSecret(text)
  if (!hit) return next(e)
  const d = await hold($, 'edit to ' + String(e.file_path ?? 'a file') + ' writes ' + hit.what + ' on line ' + hit.line + ' of the new text', 'Do not write credentials into files. Reference an environment variable instead, or write a placeholder and tell the user where to put the real value.')
  return d ?? next(e)
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      enabled = (await $.store.get('enabled')) !== false
    } catch {
      enabled = true
    }
    try {
      await $.command.register({ name: 'tripwire', description: 'Hold edits, commands, and commits that would leak a secret', argumentHint: '[on | off]', immediate: true })
    } catch (error) {
      $.ui.log('could not register /tripwire: ' + error)
    }
    return next(e)
  })

  on('command.run', { command: 'tripwire' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'on' || args === 'off') {
      enabled = args === 'on'
      await $.store.set('enabled', enabled)
      return { text: enabled ? 'tripwire on.' : 'tripwire off. Nothing is held.' }
    }
    return { text: (enabled ? 'tripwire on' : 'tripwire off') + '. Caught this session:\n' + (caught.length ? caught.map((c) => '  ' + c).join('\n') : '  nothing') }
  }).catch(async () => ({ text: 'tripwire: the command failed, so nothing changed.' }))

  on('tool.call', { tool: ['Bash', 'Edit', 'Write', 'MultiEdit'] }, guard).catch(async ($, e, next) => {
    if (next.called) return next(e)
    return { deny: 'tripwire: could not check this call (' + next.error.kind + '), so it was not run. Try again.' }
  })
}
