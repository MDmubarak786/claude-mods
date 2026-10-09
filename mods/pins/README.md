# pins

Pin instructions that survive compaction, `/clear`, and restarts. "Don't touch the migrations," said an hour ago, is gone after compaction and forgotten in the next session. `/pin` saves it for this project, and every prompt you send carries the pinned list as context Claude reads but the transcript doesn't show.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install pins@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/pins
```

## Use it

| Command | What it does |
| :-- | :-- |
| `/pin don't touch the migrations` | Pin an instruction for this project. Up to 25. |
| `/pin` | List the pins. |
| `/pin rm 2` | Remove pin 2. |
| `/pin clear` | Remove them all. |

What Claude reads after each of your prompts, unchanged from prompt to prompt so it doesn't disturb the prompt cache:

```text
Pinned instructions from the user for this project. They apply to every turn, including after compaction:
1. don't touch the migrations
2. run the tests before saying done
```

At session start, a dim line says how many pins the project has.

## What it touches

From `claude plugin validate ./mods/pins`:

```text
hooks: session.start, command.run{command=pin}, prompt.submit
calls: $.command.register, $.session.root (via key), $.store.delete, $.store.get (via load), $.store.set, $.ui.log
```

- **`prompt.submit`** adds the list as context after your prompt. Your own message is never rewritten.
- **`$.store`** holds the pins, keyed by project root. No files, processes, or network.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass. `/pin` answered from a live `claude -p` session.

## Limitations

- Pins are context, not enforcement. For "Claude may only edit these paths" use `fence`; for banned words use `style-cop`.
- A pin applies to the project root Claude Code started in. Worktrees of the same repository are separate roots.
- The store is shared by every session on the machine, so two sessions in the same project editing pins at the same time can overwrite each other's change.

## License

MIT, see the repository root.
