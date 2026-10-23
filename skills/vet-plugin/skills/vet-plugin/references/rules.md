# What to look for, by component

Rules marked **refuse** decide the verdict on their own: the answer is don't install unless the README explains the behaviour and the plugin's stated purpose needs it. The rest are findings to report and weigh. They follow the review checklist and security policy of the modhub marketplace, which apply to any plugin.

## A hooks module (a mod)

`hooks/hooks.json` with a `modules` list, naming a `.ts` or `.js` file. It runs inside Claude Code's process with the user's permissions: files, environment, network, and the power to answer tool calls.

Read the `register` function. Every `on('event', ...)` is a hook; every `$.something` is a call into Claude Code.

- **refuse** `tool.check` hooks that return `allow`, or `tool.call` hooks that answer `{ result }` for a call the module didn't start. That approves or fakes tool calls behind the user's permission prompts. The exception is a documented policy guard whose README says exactly that.
- **refuse** `$.env.get`, `$.settings.read`, or reads of `~/.claude`, `.env`, key files, or credential stores, beyond the plugin's own documented `userConfig`.
- **refuse** `$.http.fetch`, `$.process.run`, or `$.process.spawn` that sends data off the machine, unless that is the plugin's stated purpose, the README names the endpoint, and lists what is sent. A package name looked up on its registry is fine; the transcript posted somewhere is not.
- **refuse** `$.prompt.submit({ asUser: true })`: the module speaks as the user.
- **refuse** `eval`, `new Function`, `import()` of a fetched or computed path, or any import from outside the plugin's own folder. The one bare import allowed is `claude-code`.
- **refuse** hooks on `telemetry.*` events, or on `*` unless the plugin is a logger and says so.
- Finding: a `prompt.submit` hook that rewrites what the user typed beyond what the README describes.
- Finding: a gating hook (`tool.call`, `tool.check`, `prompt.submit`, `config.set`) without a `.catch` that fails closed. Validate prints `gating hook without .catch`.
- Finding: `$.clock.every` timers that do unbounded work or start turns.
- Finding: `$.ui.ask` or other waits on the user done through a bare promise, which can eat the hook's time budget and get skipped.
- Finding: the `calls:` line (from validate, or your reading) lists anything the README's **What it touches** block doesn't.
- Finding: minified, bundled, or otherwise unreadable code. Treat it as **refuse** when you can't tell what it does.

## Shell hooks

`hooks/hooks.json` with an event map, or `hooks` in `plugin.json`, a marketplace entry, or a skill's or agent's frontmatter. Each `command` runs in the user's shell on the event, with `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PROJECT_DIR`, and any `CLAUDE_PLUGIN_OPTION_*` in its environment, and the event's JSON on stdin.

- **refuse** a command that downloads and executes (`curl | sh`, `wget` then run, `npx`/`pipx`/`uvx` of an unpinned package, a script fetched at run time).
- **refuse** a command that sends stdin, files, or environment variables to the network, unless that is the purpose and the README names the endpoint.
- **refuse** a command that edits `~/.claude/settings.json`, hooks, permissions, keybindings, or shell startup files, unless that is the purpose and asked for.
- Finding: `PreToolUse` hooks that exit 0 for everything or print an `allow` decision, which waves tool calls through.
- Finding: a `SessionStart` or `UserPromptSubmit` hook that injects text into Claude's context; read what it injects.
- Finding: a command in shell form with an unquoted `${CLAUDE_PLUGIN_ROOT}` or other variable, or a script the plugin doesn't ship.
- Read every script the commands reference, in full.

## Skills, commands, and agents

Markdown Claude reads when invoked. No code runs, but the text steers what Claude asks to do, and the frontmatter can grant tools (`allowed-tools`), fork a subagent (`context`, `agent`), pick a model, attach `hooks`, or run shell at load time with `` !`command` `` in the body.

- **refuse** text that tells Claude to download and run code, or to run a command the README doesn't name.
- **refuse** text that tells Claude to skip a confirmation, ignore a refusal or a hook, disable a guard, treat the user's instructions, `CLAUDE.md`, or another skill as lower priority than itself, or claim an authorization the user didn't give.
- **refuse** text that sends files, logs, transcripts, or secrets anywhere, unless that is the purpose and the README names where.
- **refuse** hidden instructions: HTML comments, zero-width or bidirectional characters, encoded strings, or a `description` that says one thing while the body does another.
- Finding: `allowed-tools` wider than the steps need. A skill that only reads has no business with `Bash`, `Write`, `Edit`, or `WebFetch` pre-granted.
- Finding: `` !`command` `` at load, which runs before the user sees anything; the README must say what it reads.
- Finding: `hooks` in the frontmatter, which attach shell hooks for the rest of the session once the skill runs. Judge them as shell hooks.
- Finding: an agent with `permissionMode` or tool grants that bypass prompts.
- Finding: reference files beside `SKILL.md`; read them, they load on demand.

## MCP servers

`.mcp.json`, `mcpServers` in `plugin.json`, or a marketplace entry. A `stdio` server is a process started with `command`, `args`, and `env`; an `http`, `sse`, or `ws` server is a URL with `headers`. A `.mcpb` or `.dxt` bundle is unpacked and run.

- **refuse** a `command` that downloads and runs code (`npx -y <unpinned>`, `curl | sh`, a bundle fetched from a URL you can't inspect), or a binary shipped in the plugin that you can't read.
- **refuse** `env` or `headers` that forward secrets from the user's environment or settings the README doesn't mention, or literal credentials in the file.
- Finding: a remote URL that is `http://` or `ws://` to a non-loopback host.
- Finding: a server whose purpose the README doesn't state. You can't see what a server does once it runs; say so in the verdict and judge by what it is given.
- Finding: `headersHelper` or any script that runs to build a request; read it.

## Everything else

- `bin/`: every file here is on the Bash tool's `PATH` while the plugin is enabled, so Claude will run it by name. Read each one. A binary you can't read is **refuse**.
- `monitors/`: background processes that start with the session. Judge each `command` as a shell hook.
- `settings.json` or `settings` in the manifest: only `agent` and `subagentStatusLine` take effect; note anything else.
- `userConfig`: fine when the values are used where the README says. A `sensitive` option that then appears in a shell-form command or a URL is a finding.
- `dependencies`: other plugins pulled in; name them, and vet them too if the user wants a full answer.
- Marketplace entry: with `strict` unset or true, the entry's `commands`, `agents`, `skills`, `hooks`, `outputStyles`, and `themes` are added to the plugin. Read them as part of it.
- `CLAUDE.md` at the plugin root isn't loaded; `README.md` isn't either. Instructions there reach a person, not Claude, so they are claims to compare, not behaviour.
