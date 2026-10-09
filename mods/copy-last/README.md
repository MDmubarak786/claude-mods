# copy-last

Copy Claude's last reply, or its last code block, to the clipboard as clean Markdown with `/copy`. Nothing is selected in the terminal, so there's no gutter indentation, no wrapped lines, and no trailing spaces.

The pain is one of the ten most-reacted open issues on the Claude Code tracker: copy and paste from the terminal includes unwanted indentation and trailing spaces. This reads the reply's source from the transcript instead.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install copy-last@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/copy-last
```

## Use it

| Command | What it copies |
| :-- | :-- |
| `/copy` | The last reply, as Markdown source. |
| `/copy code` | The last fenced code block in the last reply, without the fence. Looks back through the last five replies if the latest has none. |
| `/copy code 2` | The second-to-last code block. |

The command prints what it copied, as a character and line count.

## What it touches

From `claude plugin validate ./mods/copy-last`:

```text
hooks: session.start, command.run{command=copy}
calls: $.command.register, $.session.messages (via lastReplies), $.ui.copy, $.ui.log
```

It reads the transcript through the mods API and writes to the clipboard through Claude Code. No files, processes, or network. Nothing is saved.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass. `/copy` answered from a live `claude -p` session.

## Limitations

- Copies the reply's source text, so Markdown syntax such as `**bold**` is copied as written. That's the point for pasting into an issue or a doc; for plain prose, copy from the terminal.
- A code block inside a tool result, as opposed to a reply, isn't found.
- Where the clipboard isn't available to Claude Code (some remote and headless sessions), the command says so.

## License

MIT, see the repository root.
