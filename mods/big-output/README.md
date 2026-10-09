# big-output

Keep huge shell output out of the context window. One `npm test`, `cat package-lock.json`, or verbose build can drop 50 KB into context, and it stays there until compaction. With this mod, a Bash result longer than a threshold is saved to a scratch file, and Claude gets the first and last 40 lines plus a note that names a `slice` tool it can call to grep or page the rest on demand.

Nothing is lost. The saved file holds the whole output; only the part in context is smaller.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install big-output@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/big-output
```

## Use it

Nothing to do. When a Bash result is longer than 20,000 characters, a dim line in the transcript says it was saved, and Claude reads the head, the tail, and this note:

```text
[big-output: this output is 1000 lines and 38 KB, so only its head and tail are shown. To read more, call the slice tool with id "1" and either grep="<regex>" or from=<line> and to=<line>. Lines are numbered from 1.]
```

Claude then calls `slice` as it needs: `grep="error"` with up to 5 lines of context, or `from=100, to=200` for a page of at most 400 lines.

| Command | What it does |
| :-- | :-- |
| `/big-output` | Show the threshold and the outputs saved this session. |
| `/big-output 50000` | Trim output longer than 50,000 characters. Remembered across sessions. |

## What it touches

From `claude plugin validate ./mods/big-output`:

```text
hooks: session.start, command.run{command=big-output}, tool.call{tool=Bash}, tool.call{tool=mcp__big-output__slice}
calls: $.command.register, $.fs.read, $.fs.write (via save), $.process.run, $.store.get, $.store.set, $.tool.register, $.ui.log
```

- **`$.process.run`** runs `mktemp -d` once at session start for the scratch directory. Nothing else is run.
- **`$.fs.write`** saves outputs there; **`$.fs.read`** reads them back for the slice tool. Both are capped at 4 MB per file, so an output beyond that is saved in part and the note says so.
- **`$.tool.register`** adds the `slice` tool Claude calls; it's loaded upfront so Claude sees its description without searching.
- The threshold is the only thing saved between sessions.

**Failure policy.** This is a convenience, not a guard. If trimming fails, Claude gets the untrimmed output.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass. `/big-output` answered from a live `claude -p` session. A real oversized command in a session hasn't been exercised on screen by the author yet.

## Limitations

- Only `stdout` is trimmed. A huge `stderr` goes through as it is.
- Saved outputs live for the session, in a temp directory. After a restart the ids are gone.
- Background commands and MCP tool outputs aren't covered.
- The slice tool's name as Claude sees it is `mcp__big-output__slice`.

## License

MIT, see the repository root.
