# memory-lint

Know whether your auto-memory index loaded whole. Claude Code reads a project's `MEMORY.md` index at session start up to a limit, and a session can't tell whether it got the whole file, a truncated one, or nothing. A long thread on the tracker asks for the threshold to be visible and configurable. Until it is, this mod measures the file at every session start, after compaction, and after each edit to it, and names the entries past the limit you set.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install memory-lint@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/memory-lint
```

## Use it

At session start, after compaction, `/clear`, or `/resume`, and after any edit to the index, the mod measures it. Under the limit, a dim line in the transcript gives the count. Over it, a status line under the prompt stays until it's fixed:

```text
⚠ memory-lint: 208 lines, 8 entries past line 200 may not load. /memory-lint lists them.
```

| Command | What it does |
| :-- | :-- |
| `/memory-lint` | Report lines, entries, size, and the entries past the limit. |
| `/memory-lint limit 300` | Set the line limit you believe applies. Saved. |
| `/memory-lint path <file>` | Point at a different index file for this project. Saved. |

**The default limit of 200 lines is a guess.** The real threshold isn't documented, which is the point of the thread. Set it to what you observe.

The index is looked for at `~/.claude/projects/<project slug>/memory/MEMORY.md`, where the slug is the project root with every character that isn't a letter or digit replaced by `-`.

## What it touches

From `claude plugin validate ./mods/memory-lint`:

```text
hooks: session.start, classic.SessionStart{source=compact|clear|resume}, tool.call{tool=Edit|Write}, command.run{command=memory-lint}
calls: $.command.register, $.fs.exists (via measure), $.fs.read (via measure), $.process.run (via locate), $.session.root (via locate), $.store.get (via locate), $.store.set, $.ui.log (via lint), $.ui.status (via lint)
```

- **`$.process.run`** runs `printenv HOME` once at session start to find your Claude directory. Nothing else is run.
- **`$.fs.read`** reads only the index file.
- **`tool.call`** on Edit and Write observes edits to the index path and passes every call through unchanged.
- **`$.store`** holds the limit and any path override.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass. `/memory-lint` answered from a live `claude -p` session.

## Limitations

- An entry is a line starting with `-` or `*`. Headings and prose lines count toward the line total but not the entry count.
- The limit is yours to set; the mod can't observe what Claude Code actually loaded.
- Only the project's index is checked, not the per-memory files it links to.

## License

MIT, see the repository root.
