# fence

Limit which paths Claude may edit in a project with one command. When Claude tries to edit, write, or change a notebook outside the fence, the call is refused before it runs and Claude reads why, so it explains instead of quietly touching files you didn't ask about.

Use it when you say "only touch `src/billing`" and want that enforced, not just hoped for.

## Install

```text
/plugin marketplace add OWNER/claude-mods
/plugin install fence@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/fence
```

## Use it

| Command | What it does |
| :-- | :-- |
| `/fence src/ docs/README.md` | Allow edits only under those paths. Relative paths resolve from the project root. |
| `/fence` | Show the current fence. |
| `/fence off` | Remove it. |

The fence is saved per project root, so it's still there after you restart Claude Code. It runs immediately, even while Claude is working, so you can tighten it mid-turn.

When an edit is refused, a dim line in the transcript names the file, and Claude receives:

```text
fence: /work/package.json is outside the paths the user allowed for this project (/work/src). Do not edit it. If the change is required, explain why and ask the user to run /fence to widen the fence.
```

## What it touches

From `claude plugin validate ./mods/fence`:

```text
hooks: session.start, command.run{command=fence}, tool.call{tool=Edit|Write|NotebookEdit}
calls: $.command.register, $.session.root, $.store.delete, $.store.get, $.store.set, $.ui.log
```

No environment variables, processes, or network. State lives in Claude Code's plugin store under a `fence:<project root>` key.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass.

## Limitations

- It guards the Edit, Write, and NotebookEdit tools only. A Bash command such as `sed -i` or `echo > file` isn't checked. Pair it with a permission rule or a Bash guard if you need that.
- Paths are compared as strings after resolving against the project root. A symlink that points outside the fence isn't followed.
- Subagents' edits are checked too, because `tool.call` fires for them. A subagent can't widen the fence; only `/fence` can.
- This is a guardrail for the model, not a security boundary. A `deny` permission rule is the hard block.

## License

MIT, see the repository root.
