# ding

A sound and a desktop notification when Claude finishes a turn or needs you. Two different sounds, so from across the room you know whether to come back now (Claude is asking a question or waiting on a permission prompt) or whenever (the turn is done).

Claude Code's own notification setting covers "done" in the terminal. This adds the "needs you" case, which is the one that costs you twenty minutes, and reaches you outside the terminal.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install ding@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/ding
```

## Use it

| Command | What it does |
| :-- | :-- |
| `/ding` | Show whether it's on, and which OS it detected. |
| `/ding off` | Quiet, on this machine, until `/ding on`. Saved across sessions. |
| `/ding test` | Play both sounds now. |

| Moment | Sound (macOS) | Notification |
| :-- | :-- | :-- |
| The main turn ends | Glass | "Claude finished" and the first line of the answer |
| The turn was interrupted | Glass | "Claude stopped" |
| Claude asks you a question | Ping | "Claude has a question" and the question |
| A tool call is about to show a permission prompt | Ping | "Claude needs permission" and the tool name |

Subagents are silent. On an OS it doesn't recognize, it shows a toast inside Claude Code instead.

## What it touches

From `claude plugin validate ./mods/ding`:

```text
hooks: session.start, command.run{command=ding}, turn.complete, tool.call{tool=AskUserQuestion}, tool.check
calls: $.command.register, $.process.run (via loadSettings, notify), $.store.get (via loadSettings), $.store.set, $.ui.log, $.ui.toast (via notify)
```

- **`$.process.run`** starts `uname` once at session start, then `afplay` and `osascript` on macOS or `paplay` and `notify-send` on Linux. The title and body are passed as arguments, never spliced into a script.
- **`tool.check`** is observe-only. The hook awaits the decision Claude Code reached, dings if it's `ask`, and returns that decision unchanged. It never approves or refuses anything.
- No environment variables, no network. The on/off flag is the only thing saved.

## Tested with

- Claude Code 2.1.295 on macOS, `claude plugin validate --strict` and `claude plugin test` pass. The Linux path is covered by tests only.

## Limitations

- macOS notifications come from Script Editor's identity, so the first one may ask you to allow notifications for it.
- On Linux it assumes PulseAudio or PipeWire (`paplay`) and a notification daemon (`notify-send`). If either is missing, the call fails quietly and nothing plays.
- Windows isn't supported yet; you get a toast inside Claude Code.
- It can't tell whether your terminal is focused, so it dings even when you're looking at it. `/ding off` while you're pairing with it.

## License

MIT, see the repository root.
