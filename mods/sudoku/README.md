# sudoku

Sudoku in a pane beside the conversation. Every puzzle is dealt from a seed and has exactly one solution; three levels leave 40, 32 or 26 givens. Move the cursor with **w**, **a**, **s** and **d**, type a digit, **0** clears, **u** takes an entry back, and **g** fills the cell you're on when you're stuck. The clock runs from your first entry to the last cell and pauses while the pane is closed; your fastest time per level survives restarts.

It's a game you play, not a watcher: it never calls a model, never reads what Claude is doing, and costs no tokens. A puzzle takes longer than most of Claude's turns, so it waits for you.

```text
SUDOKU  level normal  filled 51/81  time 4:12  best 11:40 · game 3
51 of 81 filled. u takes an entry back, g fills the cell you are on.

 5  3  . | .  7  . | .  .  .
 6  .  . | 1  9  5 | .  .  .
 .  9  8 | .  .  . | .  6  .
---------+---------+---------
 8  .  . | .  6  . | .  .  3
 4  .  . | 8  .  3 | .  .  1
 7  .  . | .  2  . | .  .  6
---------+---------+---------
 .  6  . | .  .  . | 2  8  .
 .  .  . | 4  1  9 | .  .  5
 .  .  . | .  8  . | .  7  9

w: Up   a: Left   s: Down   d: Right
1: 1   2: 2   3: 3   4: 4   5: 5   6: 6   7: 7   8: 8   9: 9   0: Clear

n: New puzzle   u: Undo   g: Hint   l: Level: normal   h: Help   Esc closes
```

The grid is colored, which the text above can't show: the givens are bold, your entries take the accent color, the cell the cursor is on sits on yellow, a digit that repeats in its row, column or box sits on red, every cell holding the cursor's digit is marked, and the whole grid turns green when it's solved. Colors follow your theme.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install sudoku@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/sudoku
```

## How to play

1. Run `/sudoku`. The pane opens with a fresh puzzle at the normal level and the cursor on the first blank cell. An untouched board shows a short how-to; **h** hides or shows it any time.
2. Every row, column and 3×3 box must hold 1 to 9 once. Move the cursor with **w**, **a**, **s** and **d** (it wraps at the edges) and type a digit. **0** clears the cell. A given can't be changed.
3. A digit that repeats in its row, column or box turns red, along with the cell it clashes with. The puzzle is solved when all 81 cells are filled with nothing red.
4. **u** takes the last entry back and puts the cursor there. **g** fills the cell you're on from the solution and counts a hint; the status line says how many you took.
5. The clock starts at your first entry and stops at the last cell. It pauses while the pane is closed, so stepping away costs nothing. Your fastest time at each level is kept.
6. **n** deals a new puzzle at the same level. **l** deals at the next level, but only while the board is untouched, so one key press never throws away your entries; with entries on the board it tells you to press **n** first or use the command.

The keys work while the pane has the focus. If typing a digit goes into the prompt instead, click the pane first.

| Command | What it does |
| :-- | :-- |
| `/sudoku` | Open the pane. Where no pane can be drawn, print how far along the puzzle is. |
| `/sudoku new` | Deal a new puzzle at the current level. The records are kept. |
| `/sudoku level easy`, `normal`, or `hard` | Deal a new puzzle at that level: 40, 32 or 26 givens. |
| `/sudoku stats` | Games, solved, fastest time per level. |

## What it touches

From `claude plugin validate ./mods/sudoku`:

```text
hooks: session.start, classic.SessionStart{source=clear|resume|fork}, command.run{command=sudoku}, ui.close{id=sudoku}, ui.render{component=Pane}
calls: $.clock.every (via startTicking), $.clock.now, $.command.register, $.session.surfaces, $.state.get, $.state.set, $.store.get (via load), $.store.set (via save), $.ui.invalidate, $.ui.log, $.ui.open, $.ui.resolve, $.ui.toast
```

- **`$.store`** keeps the puzzle, your entries, the undo list and the records. Every entry is saved, so a restart loses nothing but the stretch of clock since the pane last redrew. A loaded puzzle's clock waits for the next entry. If the store can't be read at start, the mod plays in memory and writes nothing over the saved record.
- **`$.clock`** seeds each deal, times the game, and redraws the clock once a second while a game is running in an open pane. The ticker stops on a new deal, when the puzzle is solved, and when the pane closes.
- **`ui.close`** is observed to stop the clock.
- The generator runs in the hooks module: it deals a full grid from the seed, then blanks cells while the puzzle keeps one solution. It takes a few milliseconds.
- No tool calls are observed, no files, processes, model calls, or network.

## Tested with

- Claude Code 2.1.301, `claude plugin validate --strict` and `claude plugin test` passing: the generator (the givens count at each level, one solution, a valid grid, the same seed dealing the same puzzle), the solver, entries, a refused given, clashes, clearing, undo and its cap, solving with the fastest time kept per level, hints, the cursor wrapping, the clock pausing and formatting, the guard, and mounted pane tests on the mock clock for the keys, the running clock, undo, a hint, solving with the toast, the level key on a touched and an untouched board, the commands, an unreadable store, and a narrow pane. The test kit can't fire `ui.close`, so pausing on close is covered by the load path.
- Not yet looked at in the Desktop app. The grid is built from fixed-width `Box`es with single-character rules, the same way `bingo` and `connect-four` are, which draw correctly there.

## Limitations

- One puzzle at a time per machine. Two sessions playing at once overwrite each other; the last write wins.
- No pencil marks. Keep candidates in your head, or take a hint.
- The levels are set by how many givens are left, not by which solving techniques a puzzle needs, so one hard puzzle can be harder than another.
- The digits are hotkeys, so they only reach the puzzle while the pane has the focus.

## License

MIT, see the repository root.
