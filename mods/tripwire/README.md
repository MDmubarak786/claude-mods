# tripwire

Stop secrets leaving the machine. Claude pastes a key into a config file that's about to be committed, puts a token on a `curl` command line, or runs `curl -d @.env` to "check the endpoint." This mod holds those calls with a question whose default answer is refuse, and never prints the secret itself.

The redaction mods in the ecosystem (`secret-redactor`, `honmoon-redact`) hide secrets from what Claude *reads*. This covers the other direction: what Claude *writes*, *runs*, and *commits*.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install tripwire@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/tripwire
```

## Use it

Nothing to do. Three things are held:

| Held | Examples |
| :-- | :-- |
| An Edit, Write, MultiEdit, or Bash command whose text contains a credential | AWS, GitHub, Slack, Stripe, OpenAI, Anthropic, and Google keys; a private key block; a JWT; `password = "<12+ chars>"` and similar assignments, unless the value looks like a placeholder |
| A Bash command that reads a secret file and talks to the network or encodes output | `curl -d @.env`, `cat id_rsa \| base64`, `scp credentials.json host:` |
| A `git commit` whose staged changes add a credential, or stage a secret file | `.env`, `id_rsa`, `*.pem`, `credentials.json`. `.env.example` is fine. |

The question in Claude Code's dialog names the pattern and the line, never the value:

```text
tripwire: this edit to src/config.ts writes an AWS access key on line 12 of the new text. Continue?
  1. Refuse
  2. Allow once
```

On refuse, Claude reads the same description plus what to do instead: read the value from an environment variable or a secret manager, write a placeholder, or unstage the file.

| Command | What it does |
| :-- | :-- |
| `/tripwire` | Show whether it's on and what it caught this session. |
| `/tripwire off` | Hold nothing. Remembered across sessions. |
| `/tripwire on` | Turn it back on. |

## What it touches

From `claude plugin validate ./mods/tripwire`:

```text
hooks: session.start, command.run{command=tripwire}, tool.call{tool=Bash|Edit|Write|MultiEdit}
calls: $.command.register, $.process.run (via stagedHit), $.store.get, $.store.set, $.ui.ask (via hold), $.ui.log
```

- **`$.process.run`** runs `git diff --cached --name-only` and `git diff --cached --unified=0` only when Claude is about to run `git commit`. Nothing else is run, and nothing leaves the machine.
- **`$.store`** holds the on/off flag.
- Matched values are never logged, printed, or sent anywhere, including to Claude.

**Failure policy.** This is a guard, so if a check throws or times out the call is refused rather than let through.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass. `/tripwire` answered from a live `claude -p` session. The hold dialog hasn't been seen on screen by the author yet.

## Limitations

- Under `claude -p` nobody can answer, so every hold is a refusal.
- Eleven high-precision patterns. A secret that matches none of them isn't caught; a long random string assigned to a name that isn't in the list isn't caught either. Add patterns by pull request.
- `git push` isn't scanned; the commit before it is.
- A secret already in the file before the edit isn't noticed, only what the edit adds.
- Bash commands that build a secret from pieces, or read it through a script, aren't caught.

## License

MIT, see the repository root.
