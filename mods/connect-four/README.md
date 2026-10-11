# connect-four

Connect Four against Claude, in a pane beside the conversation. Press a column's digit and your disc drops to the lowest free cell; Claude answers half a second later. Three levels: easy drops at random, normal takes wins, blocks threats and won't hand you a win on top of its disc, hard searches seven moves ahead.

It's a game you play, not a watcher: Claude's moves come from the rules in the mod, so it never calls a model, never reads what Claude is doing, and costs no tokens.

```text
CONNECT FOUR  you X · Claude O  level normal  you 1 · Claude 0 · draws 0
Claude dropped in column 4. Your move.

  1    2    3    4    5    6    7
  .    .    .    .    .    .    .
  .    .    .    .    .    .    .
  .    .    .    .    .    .    .
  .    .    .    O    .    .    .
  .    .    X    O    .    .    .
  .    X    X    O    X    O    .

n: New game   u: Undo   s: Play O   l: Level: normal   h: Help   Esc closes
```

The cells are colored, which the text above can't show: your discs on green, Claude's on Claude's color, the winning four on the accent color, the disc just dropped in bold. On the Desktop app the column buttons show their digit as a key badge; in a terminal the digit is the label.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install connect-four@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/connect-four
```

## How to play

1. Run `/connect-four`. The pane opens with an empty board and you are X. A fresh board shows a short how-to until you hide it with **h**, which also shows it again.
2. Press a column's digit, 1 to 7, or click the button above it. Your disc drops to the lowest free cell. A full column loses its key.
3. Claude answers after half a second. Four in a row, column, or diagonal wins; a full board is a draw. A toast and the status line say how it ended.
4. **n** starts a new game. The loser starts the next one; after a draw, the other side does.
5. **u** takes your last move back, together with Claude's reply. **s** swaps your side and starts a new game. **l** cycles the level.
6. Esc closes the pane. The game and the score are kept, and a reply Claude owed you comes when the pane opens again.

The keys work while the pane has the focus. If pressing a digit types into the prompt instead, click the pane first.

| Command | What it does |
| :-- | :-- |
| `/connect-four` | Open the pane. Where no pane can be drawn, print the board and whose move it is. |
| `/connect-four new` | Start a new game. The record is kept. |
| `/connect-four level easy`, `normal`, or `hard` | Change the level. |
| `/connect-four as x` or `/connect-four as o` | Choose your disc. Starts a new game. |
| `/connect-four stats` | Games, your wins, Claude's wins, draws. |

## What it touches

From `claude plugin validate ./mods/connect-four`:

```text
hooks: session.start, classic.SessionStart{source=clear|resume|fork}, command.run{command=connect-four}, ui.close{id=connect-four}, ui.render{component=Pane}
calls: $.clock.after (via scheduleClaude), $.clock.now (via load, startNew), $.command.register, $.session.surfaces, $.state.get, $.state.set, $.store.get (via load), $.store.set (via save), $.ui.invalidate, $.ui.log, $.ui.open, $.ui.resolve, $.ui.toast
```

- **`$.store`** keeps the current game, your disc, the level, and the record, so a game survives a restart. If the store can't be read at start, the mod plays in memory and writes nothing over the saved record.
- **`$.clock`** seeds each game and delays Claude's reply by half a second. The pending reply is cancelled when the pane closes, when you undo, and when a new game starts.
- **`ui.close`** is observed only to cancel that reply.
- No tool calls are observed, no files, processes, model calls, or network.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` passing: stacking and every direction of win, a drawn board, undo, the normal level taking wins, blocking and refusing a trap, hard beating easy and never losing to normal across seeds and starters, mounted pane tests for a drop, Claude's reply on the mock clock, a win, a full column, undo, swap, level and help from the footer, the commands, an unreadable store, and a narrow pane. The test kit can't fire `ui.close`, so the reply being cancelled on close is covered by the undo and new-game paths.
- Hard takes at most about 40 ms per move on a laptop. Played in the Desktop app, 2.1.293, through hot reloading.

## Limitations

- One game at a time per machine. Two sessions playing at once overwrite each other's moves; the last write wins.
- Claude's reply is a timer that lives in the session that scheduled it. Close the pane before the half second is up and the reply waits for the next `/connect-four`.
- Hard searches seven moves ahead with a simple line-count heuristic, not a perfect solver: it can be beaten with a long plan.

## License

MIT, see the repository root.
