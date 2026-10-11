# typing

A typing race on lines of code, in a pane beside the conversation. A line appears, you type it into the field below; every character colors right or wrong as you go, and Enter scores words per minute and accuracy. The last ten runs and your best are kept.

It's a game you play, not a watcher: it never calls a model, never reads what Claude is doing, and costs no tokens. Thirty seconds of warm-up while a long turn runs.

```text
TYPING  line 7/24 · best 64 wpm · 12 runs
2 wrong so far. Backspace fixes it.

const total = items.reduce((sum, item) => sum + item.price, 0)
> const total = items.reduce((sum, itme                      score

Last runs
58 wpm · 97% · 11.2 s
64 wpm · 100% · 9.8 s

n: Next line   r: Same line again   h: Help   Esc closes
```

The line is colored, which the text above can't show: characters typed right turn green, wrong ones sit on red, the next one to type is underlined, and what's left is dim. Colors follow your theme.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install typing@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/typing
```

## How to play

1. Run `/typing`. The pane opens with a line of code and a field under it, focused. Until your first scored run, a short how-to sits under the field; **h** hides or shows it any time.
2. Type the line exactly, spaces and all. The clock starts at your first key. Right characters turn green, wrong ones red; Backspace fixes them.
3. Press Enter once you've typed the whole line. Words per minute counts the characters you got right, five to a word; accuracy is right characters over the line's length, or over what you typed if that's longer. A fragment can't be scored, so a quick five letters never sets the record. The status line says if it's your best.
4. **n** brings the next line, **r** the same one again. Twenty-four lines rotate, never the same one twice in a row.
5. Esc closes the pane. Scored runs are saved; a half-typed line is still there when you reopen the pane, and starts over after a restart or `/clear`.

While the field has the focus every key goes to it, so press Esc once to use **n**, **r** or **h**, or click them. After a run is scored the field goes away and Enter on the focused Next button brings the next line.

| Command | What it does |
| :-- | :-- |
| `/typing` | Open the pane. Where no pane can be drawn, print the line and your record. |
| `/typing new` | A new line. |
| `/typing stats` | Runs, best words per minute, and the last ten runs. |

## What it touches

From `claude plugin validate ./mods/typing`:

```text
hooks: session.start, classic.SessionStart{source=clear|resume|fork}, command.run{command=typing}, ui.render{component=Pane}
calls: $.clock.now, $.command.register, $.session.surfaces, $.state.get, $.state.set, $.store.get (via load), $.store.set (via save), $.ui.focus (via restart), $.ui.invalidate, $.ui.log, $.ui.open, $.ui.resolve, $.ui.toast
```

- **`$.store`** keeps the current line, the last ten runs, and the record. Keystrokes are drawn, not saved; a scored run is. If the store can't be read at start, the mod plays in memory and writes nothing over the saved record.
- **`$.clock`** picks each line and times the run from the first key to Enter. There is no timer: nothing happens between your keys.
- **`$.ui.focus`** puts the keys back in the field after **n** or **r**, so the next line can be typed at once.
- No tool calls are observed, no files, processes, model calls, or network. The lines you type are the built-in list, never anything from your session.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` passing: the snippet list (plain ASCII, one line, at most 72 columns), picking a line, marking characters, the clock from the first key, scoring and the history, mounted pane tests typing into the field and submitting on the mock clock, the commands, an unreadable store, and a narrow pane.
- Played in the Desktop app, 2.1.293, through hot reloading.

## Limitations

- Words per minute is on correct characters only, so a run full of mistakes scores low twice over. That's the point.
- The field is one line; a line of code is never longer than 72 characters, but a very narrow pane wraps it.
- Lines are a fixed list of twenty-four. Add yours in `hooks/game.ts` and open a pull request.

## License

MIT, see the repository root.
