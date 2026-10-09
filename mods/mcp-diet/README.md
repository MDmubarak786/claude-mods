# mcp-diet

Choose which MCP tools and subagent types Claude sees, per project. Every connected MCP server sends its tool descriptions with every request; four servers have cost people tens of thousands of tokens before the first prompt. Claude Code's tool search helps across the board, but you can't say "in this repo, Claude never needs the Jira tools." Now you can.

A pane lists every server and tool with the size of its description. Press a button to cycle a tool, a whole server, or a subagent type through **on**, **defer** (Claude sees the name only, until it searches for it), and **hide** (withheld). Choices are saved per project.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install mcp-diet@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/mcp-diet
```

## Use it

| Command | What it does |
| :-- | :-- |
| `/mcp-diet` | Open the pane. Where no pane can be drawn, print the list instead. |
| `/mcp-diet list` | Print every server, tool, and subagent type seen this session, with token estimates and current choices. |
| `/mcp-diet defer <name>` | Claude sees the tool's name only, until it searches for it. |
| `/mcp-diet hide <name>` | The tool or subagent type is withheld from Claude. |
| `/mcp-diet show <name>` | Back to normal. |

`<name>` is a tool as Claude sees it (`mcp__jira__create_issue`), a whole server (`mcp__jira`), or a subagent type (`pr-review-toolkit:code-reviewer`). A tool's own choice wins over its server's.

**When it applies.** Claude Code asks a mod for a tool's description once, when the tool is first sent to Claude. A change you make therefore applies to the next session, not the running one. The pane and the commands say so.

## What it touches

From `claude plugin validate ./mods/mcp-diet`:

```text
hooks: session.start, tool.describe, agent.offer, command.run{command=mcp-diet}, ui.render{component=Pane}
calls: $.command.register, $.session.root (via loadChoices), $.store.get (via loadChoices), $.store.set (via saveChoices), $.tool.list (via inventory), $.ui.invalidate, $.ui.log, $.ui.open, $.ui.resolve
```

- **`tool.describe`** returns a stub description and `isDeferred: true` for a hidden tool, and `isDeferred: true` with the real description for a deferred one. Nothing else about a tool changes.
- **`agent.offer`** returns `isOffered: false` for a hidden subagent type.
- **`$.store`** holds the choices, keyed by project root. No files, processes, or network.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass, including a mounted pane test. `/mcp-diet list` answered from a live `claude -p` session. The pane hasn't been seen on screen by the author yet.

## Limitations

- Takes effect next session, for the reason above.
- Token estimates are description length divided by four. The real cost also includes each tool's input schema, which the mods API doesn't expose.
- Subagent types appear in the list only after Claude Code has offered them in the session, which happens at start.
- Hiding a tool doesn't disconnect its server. The server still starts; its description just isn't sent.

## License

MIT, see the repository root.
