# undo-agent

Undo the file edits a subagent made. `/rewind` restores the files your own turns changed, but Claude Code's [checkpointing docs](https://code.claude.com/docs/en/checkpointing#subagent-edits-not-restored) are explicit that a subagent's edits aren't captured: "use git to revert them." A background review with `--fix`, a forked skill, or a workflow agent can change a dozen files you then can't take back without a commit to fall back on.

This mod snapshots each file before a subagent's Edit, Write, or NotebookEdit and puts them back with one command.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install undo-agent@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/undo-agent
```

## Use it

When a subagent that changed files finishes, a dim line in the transcript says so:

```text
● undo-agent: agent a1b2c3 changed 4 file(s). /undo-agent last puts them back.
```

| Command | What it does |
| :-- | :-- |
| `/undo-agent` | List the agents that changed files this session, newest first, with the files. |
| `/undo-agent last` | Put back the files the most recent agent changed, after a confirmation. Files it created are removed. |
| `/undo-agent <id>` | The same for one agent by id. |

A question asks first, because restoring overwrites whatever the files hold now, including edits made since. Each restored or removed file is named in the reply. Your own turns' edits are never touched; use `/rewind` for those.

## What it touches

From `claude plugin validate ./mods/undo-agent`:

```text
hooks: session.start, tool.call{tool=Edit|Write|NotebookEdit}, turn.complete, command.run{command=undo-agent}
calls: $.command.register, $.fs.exists (via snapshot, restore), $.fs.read (via snapshot, restore), $.fs.stat (via snapshot, restore), $.fs.write (via snapshot, restore), $.process.run (via restore), $.ui.ask, $.ui.log
```

- **`$.process.run`** runs `mktemp -d` once at session start for a scratch directory, and `rm -f -- <path>` only on a file the agent created, only when you run `/undo-agent`, and the path is printed. Nothing else is run.
- **`$.fs.read` and `$.fs.write`** read a file before a subagent edits it, write the copy to the scratch directory, and write it back on undo.
- Nothing is saved between sessions and nothing leaves the machine.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass. `/undo-agent` answered from a live `claude -p` session. Restoring real subagent edits hasn't been exercised on screen by the author yet; the tests drive it against a fake file system.

## Limitations

- Snapshots live in memory and a temp directory for the session. A reload of the mod or a restart forgets them.
- Only the three file-editing tools are watched. A subagent's Bash command that moves or deletes files isn't captured, the same gap `/rewind` has.
- A symlink, a directory, an unreadable file, or a file over 4 MiB isn't snapshotted and is named as skipped on undo. A path that has become a link by undo time is skipped too, so a restore never writes through a link.
- Under `claude -p` nobody can confirm, so `/undo-agent last` restores nothing there.
- The first snapshot of a file wins, so `/undo-agent` restores the state before the agent's first edit of it.

## License

MIT, see the repository root.
