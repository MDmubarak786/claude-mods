# circuit-breaker

Stop Claude from retrying the same failing shell command over and over. After the same Bash command fails three times in a row, the next identical attempt is held and you choose: **Stop**, or **Try once more**. Stop refuses the call with a message that tells Claude to explain what it thinks is wrong and change approach instead of trying again.

Use it when you leave Claude on a long task and don't want to come back to twelve attempts at the same broken command.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install circuit-breaker@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/circuit-breaker
```

## Use it

| Command | What it does |
| :-- | :-- |
| `/breaker` | Show the threshold. The default is 3. |
| `/breaker 5` | Hold a command after 5 identical failures in a row. Saved across sessions. |
| `/breaker off` | Never hold a command. |

While a streak builds, the spinner reads `Thinking · same command failed 2×`. At the threshold a question appears in Claude's own dialog with the command in it. Press **1** to stop or **2** to let it try once more. If you let it run and it fails again, you're asked again.

When you stop it, Claude reads:

```text
circuit-breaker: this command has failed 3 times in a row with the same result, and the user chose to stop. Do not run it again. Explain what you think is wrong, propose a different approach, or ask the user. Last error: command not found: frob
```

A streak is counted per agent, so a subagent's retries don't trip the main conversation's breaker and the other way round. The streak clears when that agent's turn ends, when the command succeeds, or when a different command runs.

## What it touches

From `claude plugin validate ./mods/circuit-breaker`:

```text
hooks: session.start, command.run{command=breaker}, tool.call{tool=Bash}, turn.complete, ui.render{component=Spinner}
calls: $.command.register, $.store.get, $.store.set, $.ui.ask, $.ui.invalidate, $.ui.log
```

No environment variables, processes, or network. The threshold is the only thing saved, in Claude Code's plugin store.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass.

## Limitations

- "Identical" means the exact same command text. A retry with a changed flag or path is a new command, which is usually what you want.
- Under `claude -p`, or if you dismiss the question, the held command is refused. The breaker never lets a command through on its own.
- It watches the Bash tool only. A loop of failing Edit calls or MCP tool calls isn't caught.
- A hook that times out or throws refuses that one command rather than letting it run. If that happens, run the command once more; the streak is in memory and resets on reload.

## License

MIT, see the repository root.
