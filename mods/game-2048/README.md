# game-2048

2048 in a pane beside the conversation. Slide the tiles with **w**, **a**, **s** and **d**; two equal tiles that meet merge into one and score; a new tile appears after every move. Make a 2048 tile, then keep going for a higher one. Two undos, a best score and highest tile that survive restarts, and a board that replays from its seed.

It's a game you play, not a watcher: it never calls a model, never reads what Claude is doing, and costs no tokens.

![2048 in a pane: two 128s merge, then two 256s make 512.](screenshots/2048.gif)

*Recorded in a terminal. The Desktop app draws the same pane, with each key shown as a badge.*

```text
2048  score 1256  best 4512 · highest 512 · move 83
Score 1256 · best 4512

  ┌─────┐┌─────┐┌─────┐┌─────┐
  │     ││  2  ││  8  ││  4  │
  └─────┘└─────┘└─────┘└─────┘
  ┌─────┐┌─────┐┌─────┐┌─────┐
  │  2  ││ 16  ││ 32  ││ 16  │
  └─────┘└─────┘└─────┘└─────┘
  ┌─────┐┌─────┐┌─────┐┌─────┐
  │  8  ││ 64  ││ 128 ││ 32  │
  └─────┘└─────┘└─────┘└─────┘
  ┌─────┐┌─────┐┌─────┐┌─────┐
  │ 16  ││ 256 ││ 512 ││ 64  │
  └─────┘└─────┘└─────┘└─────┘

w: Up   a: Left   s: Down   d: Right

n: New game   u: Undo (2)   h: Help   Esc closes
```

The tiles are colored, which the text above can't show. They use the original game's palette, so the board looks the same on any theme: beige empty slots, cream 2s and 4s, orange deepening through 8 to 64, gold from 128 to 2048, and near-black beyond. Each tile is three rows tall with its number centered.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install game-2048@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/game-2048
```

## How to play

1. Run `/2048`. The pane opens with two tiles on a 4 by 4 board. A fresh board shows a short how-to until you hide it with **h**, which also shows it again.
2. Press **w**, **a**, **s** or **d**, or click the arrow buttons. Every tile slides that way as far as it can. Two equal tiles that meet merge, once per move, and the merged value is added to your score.
3. A 2, or one time in ten a 4, appears on an empty cell after each move that changed the board. A slide that changes nothing is refused with a toast and spawns nothing.
4. Make a 2048 tile and the status line says so; play goes on. The game ends when no slide changes the board.
5. **u** takes back the last move, once, including a 2048 it made. **n** starts a new game; the best score and highest tile are kept.
6. Esc closes the pane. The board is saved on every move.

The keys work while the pane has the focus. If pressing **w** types into the prompt instead, click the pane first.

| Command | What it does |
| :-- | :-- |
| `/2048` | Open the pane. Where no pane can be drawn, print the board and the score. |
| `/2048 new` | Start a new game. |
| `/2048 stats` | Games played, best score, highest tile. |

## What it touches

From `claude plugin validate ./mods/game-2048`:

```text
hooks: session.start, classic.SessionStart{source=clear|resume|fork}, command.run{command="2048"}, ui.render{component=Pane}
calls: $.clock.now (via load, startNew), $.command.register, $.session.surfaces, $.state.get, $.state.set, $.store.get (via load), $.store.set (via save), $.ui.invalidate, $.ui.log, $.ui.open, $.ui.resolve, $.ui.toast
```

- **`$.store`** keeps the board, the score, the last two moves for undo, and the record, so a game survives a restart. A game saved by 0.1.x, with its single undo, loads as it was. If the store can't be read at start, the mod plays in memory and writes nothing over the saved record.
- **`$.clock`** seeds each game. There is no timer: nothing happens between your moves.
- No tool calls are observed, no files, processes, model calls, or network.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` passing: line sliding and merging, all four directions, seeded spawns, a move that changes nothing, two undos and a refused third, a saved game from 0.1.x, game over on a locked board, the 2048 win that keeps play going, mounted pane tests for the keys, the status lines, the commands, an unreadable store, and a narrow pane.
- Played in the Desktop app, 2.1.293, through hot reloading.

## Limitations

- One game at a time per machine. Two sessions playing at once overwrite each other; the last write wins.
- Two levels of undo, and none after a new game.
- The arrow keys are not hotkeys a mod can take; the letters w, a, s, d are.

## License

MIT, see the repository root.
