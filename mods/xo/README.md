# xo

Tic-tac-toe against Claude, in a pane beside the conversation. Press a square's digit to play there; Claude answers half a second later. Three levels: easy plays at random, normal blocks and takes wins but can be beaten, hard plays perfect minimax and never loses.

It's a game you play, not a watcher: Claude's moves come from a few lines of rules in the mod, so it never calls a model, never reads what Claude is doing, and costs no tokens. Good for the thirty seconds while a long tool call runs.

```text
XO  you X · Claude O  level normal  you 2 · Claude 1 · draws 3
Claude played 5. Your move.

  X     2     3
  4     O     6
  7     8     9

n: New game   u: Undo   s: Play O   l: Level: normal   h: Help   Esc closes
```

The squares are colored, which the text above can't show: your marks on green, Claude's on Claude's color, the winning three on the accent color. On the Desktop app each empty square is a button with its digit as a key badge; in a terminal the digit is the label.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install xo@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/xo
```

## How to play

1. Run `/xo`. The pane opens with an empty board and you are X. A fresh board shows a short how-to until you hide it with **h**, which also shows it again.
2. Press the digit of a square, 1 to 9 in reading order, or click it. A taken square just gets a toast.
3. Claude answers after half a second. Three in a row, column, or diagonal wins; a full board is a draw. A toast and the status line say how it ended.
4. **n** starts a new game. The loser starts the next one; after a draw, the other side does.
5. **u** takes your last move back, together with Claude's reply. **s** swaps your side and starts a new game. **l** cycles the level.
6. Esc closes the pane. The game and the score are kept, and a reply Claude owed you comes when the pane opens again.

The keys work while the pane has the focus. If pressing a digit types into the prompt instead, click the pane first.

| Command | What it does |
| :-- | :-- |
| `/xo` | Open the pane. Where no pane can be drawn, print the board and whose move it is. |
| `/xo new` | Start a new game. The record is kept. |
| `/xo level easy`, `normal`, or `hard` | Change the level. Hard never loses: a draw is the best you can get. |
| `/xo as x` or `/xo as o` | Choose your mark. Starts a new game. |
| `/xo stats` | Games, your wins, Claude's wins, draws. |

## What it touches

From `claude plugin validate ./mods/xo`:

```text
hooks: session.start, classic.SessionStart{source=clear|resume|fork}, command.run{command=xo}, ui.close{id=xo}, ui.render{component=Pane}
calls: $.clock.after (via scheduleClaude), $.clock.now (via load, startNew), $.command.register, $.session.surfaces, $.state.get, $.state.set, $.store.get (via load), $.store.set (via save), $.ui.invalidate, $.ui.log, $.ui.open, $.ui.resolve, $.ui.toast
```

- **`$.store`** keeps the current game, your mark, the level, and the record, so a game survives a restart. If the store can't be read at start, the mod plays in memory and writes nothing over the saved record.
- **`$.clock`** seeds each game and delays Claude's reply by half a second. The pending reply is cancelled when the pane closes, when you undo, and when a new game starts.
- **`ui.close`** is observed only to cancel that reply.
- No tool calls are observed, no files, processes, model calls, or network.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` passing: the rules, every possible game against the hard level as X and as O to show it never loses, the normal level blocking and taking wins, mounted pane tests for a move, Claude's reply on the mock clock, a win, undo, swap and level from the footer, the commands, an unreadable store, and a narrow pane. The test kit can't fire `ui.close`, so the reply being cancelled on close is covered by the undo and new-game paths.
- Played in the Desktop app, 2.1.293, through hot reloading.

## Limitations

- One game at a time per machine. Two sessions playing at once overwrite each other's moves; the last write wins.
- Claude's reply is a timer that lives in the session that scheduled it. Close the pane before the half second is up and the reply waits for the next `/xo`.
- Hard is perfect, so against it you can only draw. Normal is the level to beat.

## License

MIT, see the repository root.
