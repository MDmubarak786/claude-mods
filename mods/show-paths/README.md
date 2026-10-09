# show-paths

Put the file path on every Read, Edit, Write, Glob, and Grep row in the transcript. Claude Code draws `Read 1 file (ctrl+o to expand)`; this mod keeps that row and adds `src/app.ts` beside it, relative to the project root, so you never expand a row just to learn which file it touched.

The request behind it is one of the most-reacted open issues on the Claude Code tracker ([anthropics/claude-code#21151](https://github.com/anthropics/claude-code/issues/21151)): no indication of which file, so you can't audit a session by scrolling it.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install show-paths@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/show-paths
```

## Use it

Nothing to do. Rows for these tools gain a dim path after Claude Code's own text:

| Tool | What's shown |
| :-- | :-- |
| Read, Edit, Write, MultiEdit | The file path, relative to the project root when it's inside it |
| NotebookEdit | The notebook path |
| Glob | The pattern, and the directory if one was given |
| Grep | The pattern, and the directory if one was given |

Bash and every other tool are drawn the way Claude Code draws them.

| Command | What it does |
| :-- | :-- |
| `/show-paths` | Show whether it's on. |
| `/show-paths off` | Draw rows the way Claude Code does. Remembered across sessions. |
| `/show-paths on` | Turn it back on. |

## What it touches

From `claude plugin validate ./mods/show-paths`:

```text
hooks: session.start, command.run{command=show-paths}, ui.render{component=ToolUse}
calls: $.command.register, $.session.root (via loadSettings), $.store.get (via loadSettings), $.store.set, $.ui.invalidate, $.ui.log, $.ui.resolve
```

It changes nothing Claude reads. The only saved value is the on/off flag.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass. The row layout is verified by mount tests in the terminal surface; the mod has no command output to check under `claude -p`, so the rows haven't been seen on screen by the author yet. Screenshots welcome.

## Limitations

- A collapsed group of calls ("Read 3 files") is its own render site, `ToolGroup`, and isn't labeled yet.
- A refused call's reason is drawn by Claude Code in the result row, not by this mod.
- A path outside the project root is shown in full.

## License

MIT, see the repository root.
