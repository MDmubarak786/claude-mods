# standup

Your day, written for you. Every finished turn is logged with the project, the files touched, and the first line of Claude's answer. `/standup` gathers today's log across every Claude Code session on the machine and asks a small model for a three-to-five-bullet update. `/standup 3` covers three days; `--md` writes it to a file.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install standup@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/standup
```

## Use it

| Command | What it does |
| :-- | :-- |
| `/standup` | Today's work, across sessions, as bullets written by Haiku. |
| `/standup 3` | The last three days. Up to 30. |
| `/standup raw` | The log itself, grouped by project, with no model call. |
| `/standup --md notes/standup.md` | Also write the update to a file, relative to the project root. |

The log a turn adds looks like this, and it's what the model is given:

```text
## app (2 turns, 3 files)
- 09:14 Fixed the login redirect and added a test. [src/login.ts, src/login.test.ts]
- 10:02 Renamed the session helpers. [src/session.ts]
```

Logs older than 14 days are pruned at session start.

## What it touches

From `claude plugin validate ./mods/standup`:

```text
hooks: session.start, tool.call{tool=Edit|Write|MultiEdit|NotebookEdit}, turn.complete, command.run{command=standup}
calls: $.command.register, $.fs.write, $.model.complete, $.session.id, $.session.root, $.store.delete (via prune), $.store.get (via record, gather), $.store.keys (via prune, gather), $.store.set (via record), $.ui.log (via record)
```

- **`$.model.complete`** sends the log to Haiku only when you run `/standup` without `raw`, on your plan or API key. The call has no conversation history.
- **`$.fs.write`** writes only the file you name with `--md`.
- **`$.store`** holds the log, one key per session and day, so concurrent sessions don't overwrite each other.
- **`tool.call`** and **`turn.complete`** observe and pass everything through unchanged.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass with a stubbed model. `/standup` answered from a live `claude -p` session. A live Haiku call hasn't been exercised by the author in a session yet.

## Limitations

- The first non-heading line of Claude's answer is the summary. A turn whose answer starts with a code block logs the line after it.
- Subagent turns aren't logged; their work shows up through the files the main turn touched.
- The store is capped at 4 MB in total across all mods; the log keeps 200 entries per session-day and 14 days, which fits comfortably.

## License

MIT, see the repository root.
