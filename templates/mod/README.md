# __NAME__

__DESCRIPTION__

<!-- Two or three sentences a stranger understands: what pain it removes, and what you see when it works. -->

## Demo

<!-- Required if the mod draws anything. Put files in screenshots/ and reference them here. -->

## Install

```text
/plugin marketplace add OWNER/claude-mods
/plugin install __NAME__@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/__NAME__
```

## Use it

<!-- Commands, keys, buttons. What happens in claude -p or the Desktop app if that differs. -->

- `/__NAME__` prints how many tool calls Claude has made since the mod loaded.

## What it touches

Paste the lines from `claude plugin validate ./mods/__NAME__` so users can see what the mod does without reading the code:

```text
hooks: session.start, tool.call, command.run{command=__NAME__}, ui.render{component=Spinner}
calls: $.command.register, $.ui.invalidate, $.ui.log
```

<!-- If the mod reads env vars, runs processes, or makes network requests, say why here. -->

## Tested with

- Claude Code `X.Y.Z` in the terminal <!-- and/or the Desktop app -->

## Limitations

<!-- What it can't catch, doesn't handle, or where it falls back. Honest limits build trust. -->

## License

MIT, see the repository root.
