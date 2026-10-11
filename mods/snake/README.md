# snake

Snake in a pane beside the conversation. Steer with **w**, **a**, **s** and **d**, eat the food to grow and score, and don't hit the walls or yourself. The snake moves on a clock while the pane is open; **p** pauses, Esc closes and pauses, and the high score survives restarts.

It's a game you play, not a watcher: it never calls a model, never reads what Claude is doing, and costs no tokens.

```text
SNAKE  score 4  best 12 · length 7 · 150 ms
Eat the * and don't hit the walls or yourself.
┌────────────────────────────────────────┐
│ . . . . . . . . . . . . . . . . . . . .│
│ . . . . . . . . . . . . * . . . . . . .│
│ . . . . . . . . . . . . . . . . . . . .│
│ . . . . .             > . . . . . . . .│
│ . . . . . . . . . . . . . . . . . . . .│
│ . . . . . . . . . . . . . . . . . . . .│
│ . . . . . . . . . . . . . . . . . . . .│
│ . . . . . . . . . . . . . . . . . . . .│
│ . . . . . . . . . . . . . . . . . . . .│
│ . . . . . . . . . . . . . . . . . . . .│
└────────────────────────────────────────┘
w: Up   a: Left   s: Down   d: Right   p: Pause

n: New game   h: Help   Esc closes and pauses
```

The board is colored, which the text above can't show: the body is a run of green cells, the head is on the accent color and points the way it's going, the food sits on yellow, and the border turns red when you crash. Colors follow your theme.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install snake@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/snake
```

## How to play

1. Run `/snake`. The pane opens with a three-long snake waiting in the middle. A fresh game shows a short how-to until the first move; **h** hides or shows it any time.
2. Press **w**, **a**, **s** or **d**, or click the arrow buttons. The snake sets off and keeps moving, one cell every 150 ms; each press turns it. A turn straight back into the body is ignored.
3. Run over the `*` to eat it: the snake grows by one and you score a point. A new `*` appears on a free cell.
4. Hitting a wall or your own body ends the game. A toast says the score and whether it's a new best. **n** starts a new game.
5. **p** pauses and resumes. Esc closes the pane and pauses; `/snake` again picks up where you were, paused, so you choose when it moves.

The keys work while the pane has the focus. If pressing **w** types into the prompt instead, click the pane first.

| Command | What it does |
| :-- | :-- |
| `/snake` | Open the pane. Where no pane can be drawn, print the score and state. |
| `/snake new` | Start a new game. The best score is kept. |
| `/snake speed 100` | Milliseconds between moves, 60 to 500. Default 150. Applies at once. |
| `/snake stats` | Games played, best score. |

## What it touches

From `claude plugin validate ./mods/snake`:

```text
hooks: session.start, classic.SessionStart{source=clear|resume|fork}, command.run{command=snake}, ui.close{id=snake}, ui.render{component=Pane}
calls: $.clock.every (via startTimer), $.clock.now (via load, startNew), $.command.register, $.session.surfaces, $.state.get, $.state.set, $.store.get (via load), $.store.set (via save), $.ui.invalidate, $.ui.log, $.ui.open, $.ui.resolve, $.ui.toast
```

- **`$.store`** keeps the game and the record. A plain move is drawn but not saved; eating, crashing, pausing, and closing the pane save, so a restart loses at most a few cells of travel. A loaded game always waits, paused, for a key. If the store can't be read at start, the mod plays in memory and writes nothing over the saved record.
- **`$.clock`** seeds the food and moves the snake every `speed` milliseconds while the pane is open and the game runs. The clock stops on pause, on game over, on a new game, and when the pane closes.
- **`ui.close`** is observed to stop the clock and pause.
- No tool calls are observed, no files, processes, model calls, or network.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` passing: the rules (start, turns, reverse ignored, eating, walls, the body, following your own tail), speed clamping, mounted pane tests on the mock clock for starting, moving, eating, pausing, crashing and the toast, the commands, an unreadable store, and a narrow pane. The test kit can't fire `ui.close`, so pausing on close is covered by the pause key and the load path.
- Played in the Desktop app, 2.1.293, through hot reloading.

## Limitations

- One game at a time per machine. Two sessions playing at once overwrite each other; the last write wins.
- The arrow keys are not hotkeys a mod can take; the letters w, a, s, d are.
- The board redraws on every move, 200 cells at a time. At the fastest speed on a slow terminal it may stutter; `/snake speed 150` is the comfortable default.

## License

MIT, see the repository root.
