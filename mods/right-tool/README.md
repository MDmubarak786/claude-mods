# right-tool

Stop Claude using `cat`, `grep`, `find`, and `sed` in Bash when the Read, Grep, and Glob tools fit. Each of those Bash calls costs you a permission prompt and dumps raw shell output into the context window. This mod refuses the call and tells Claude the exact tool call to make instead; Claude complies on its next step.

The habit is a long-standing, much-upvoted complaint ([anthropics/claude-code#19649](https://github.com/anthropics/claude-code/issues/19649)).

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install right-tool@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/right-tool
```

## Use it

Nothing to do. These simple forms are redirected; everything else runs:

| Bash | Becomes |
| :-- | :-- |
| `cat file` | Read `file` |
| `head -n 20 file`, `head -20 file` | Read `file` with `limit=20` |
| `tail -n 30 file` | Read `file` |
| `sed -n '10,20p' file` | Read `file` with `offset=10, limit=11` |
| `grep -rn pattern dir`, `grep -rl pattern . --include=*.ts` | Grep with the pattern, path, output mode, and glob |
| `find dir -name '*.go' [-type f]` | Glob `dir/**/*.go` |

A command with a pipe, `&&`, `;`, a redirection, a shell glob, a substitution, more than one file, or a flag the mod doesn't understand is left alone. So is `ls`.

What Claude reads when a call is refused:

```text
right-tool: do not use Bash for this. Call the Read with file_path="src/app.ts" tool instead. It needs no permission prompt and its output is formatted for you. Use Bash only for commands that run something.
```

| Command | What it does |
| :-- | :-- |
| `/right-tool` | Show whether it's on and how many calls were redirected since load. |
| `/right-tool off` | Let every Bash command through. Remembered across sessions. |
| `/right-tool on` | Turn it back on. |

After a turn with redirects, a line under Claude's answer gives the count.

## What it touches

From `claude plugin validate ./mods/right-tool`:

```text
hooks: session.start, command.run{command=right-tool}, tool.call{tool=Bash}, turn.complete
calls: $.command.register, $.store.get, $.store.set, $.ui.log
```

No files, processes, or network. The on/off flag is the only thing saved.

**Failure policy.** This is a nudge, not a safety guard, so if the hook throws or times out the command runs and a dim line says so. That's the opposite of `fence` and `circuit-breaker`, which fail closed, and it's deliberate.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass. `/right-tool` answered from a live `claude -p` session.

## Limitations

- `tail -n N` can't become an exact `offset` without knowing the file length, so it becomes a plain Read of the file.
- Only the listed flags are understood. `grep -P`, `find -newer`, and the like pass through on purpose.
- It redirects subagents' Bash calls too, but the footer counts only the main conversation.

## License

MIT, see the repository root.
