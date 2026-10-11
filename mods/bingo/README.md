# bingo

Classic 75-ball bingo, you against Claude, in a pane beside the conversation. Numbers are called one at a time. You mark them on your card and shout Bingo when you have a row, column, or diagonal. Claude plays a card of its own, marks it as numbers are called, and claims a line one call late, so you always get a window to shout first.

It's a game you play, not a watcher: it never calls a model, never reads what Claude is doing, and costs no tokens. Call numbers yourself, or turn on Auto and let them come every few seconds while Claude works.

```text
BINGO  you vs Claude  called 23/75  [ last G-52 ]
recent: B-7  N-33  O-68  I-21  G-52
On your card: G-52. Tab or click the lit cell, then Enter to mark it.

Your card                      Claude's card
   B    I    N    G    O          B    I    N    G    O
   3   17   31   58   65         12   18   31   47   62
   9   21   33   52   70          3   21   33   52   70
  14   25 FREE   48   68         15   29 FREE   49   68
   7   19   40   60   61          8   22   40   60   64
  11   30   45   55   73         11   26   44   55   75

 12  called, mark it    12  marked    12  a full line   12 not called

c: Call   a: Auto off   b: Bingo!   n: New game   h: Help   Esc closes · you 2 · Claude 1
```

The cells are colored, which the text above can't show. Colors follow your theme: a called number you haven't marked sits on a yellow cell, a mark is green, a completed line takes the accent color, uncalled numbers are dim, and the number just called is on a highlighted badge in the header. Claude's marks are drawn on its card in Claude's color, and the line it is about to claim in red. A fresh game in a wide pane opens with a boxed how-to under the cards; **h** hides or shows it any time, at any width.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install bingo@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/bingo
```

## How to play

1. Run `/bingo`. The pane opens with your card on the left and Claude's on the right.
2. Press **c** to call a number, or **a** to turn on Auto, which calls one every 8 seconds while the pane is open.
3. When a called number is on your card, the cell lights up yellow and the status line names it. Tab or click to that cell and press Enter to mark it: it turns green. Press again to unmark. Uncalled numbers stay dim.
4. When you have a full row, column, or diagonal, the line takes the accent color and the status line says so: press **b**. A false shout just gets a toast.
5. Claude marks its card by itself. When it completes a line, a toast says so, the line is drawn in red on Claude's card, and the status line turns yellow unless you have a line of your own to shout. Claude claims at the next call, so shout first and you win.
6. **n** starts a new game, **h** shows or hides the how-to. Esc closes the pane; the game and the score are kept.

The keys work while the pane has the focus. If pressing **c** types into the prompt instead, click the pane or press ctrl+x then tab.

| Command | What it does |
| :-- | :-- |
| `/bingo` | Open the pane. Where no pane can be drawn, print the game's state. |
| `/bingo new` | Start a new game. The win-loss record is kept. |
| `/bingo speed 5` | Auto calls a number every 5 seconds (1 to 120; default 8). |
| `/bingo stats` | Games played, your wins, Claude's wins. |

Cards follow the standard layout: B holds 1 to 15, I 16 to 30, N 31 to 45 with a FREE center, G 46 to 60, O 61 to 75.

## What it touches

From `claude plugin validate ./mods/bingo`:

```text
hooks: session.start, classic.SessionStart{source=clear|resume|fork}, command.run{command=bingo}, ui.close{id=bingo}, ui.render{component=Pane}
calls: $.clock.every (via startAuto), $.clock.now (via load, startNew), $.command.register, $.session.surfaces, $.state.get, $.state.set, $.store.get (via load), $.store.set (via save), $.ui.invalidate, $.ui.log, $.ui.open, $.ui.resolve, $.ui.toast
```

- **`$.store`** keeps the current game and the record, so a game survives a restart.
- **`$.clock`** seeds each game and runs the Auto caller. The caller stops when the pane closes, when the game ends, or when Auto is turned off.
- **`ui.close`** is observed only to stop the caller.
- **`$.ui.invalidate`** redraws the pane when **h** shows or hides the how-to, which is kept in memory and not saved.
- No tool calls are observed, no files, processes, model calls, or network.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` passing, including mounted pane tests at wide and narrow widths, the how-to and the status prompts, the Auto caller against a mock clock, and a full game to a Claude win. The test kit can't fire `ui.close`, so the caller stopping on close is covered only by the equivalent Auto-off path. `/bingo stats` answered from a live `claude -p` session. Played in the Desktop app, 2.1.293: calling, marking, false and true claims, Auto, and Claude's claim all seen on screen, and the 0.1.1 grid, colors, legend and how-to looked at there on a dark theme. Say so in an issue if a theme makes a lit cell hard to read.

## Limitations

- One game at a time per machine. A session loads the saved game when it starts and saves on every change, so two sessions playing at once overwrite each other: the last write wins.
- Auto runs only while the pane is open, and turns itself off when a game ends. Closing the pane pauses the game.
- The cards are laid out as a grid of fixed-width cells rather than padded text, so they line up on the Desktop app as well as in a terminal. A theme with no color for `warning`, `success`, or `suggestion` shows the cells uncolored; the status line still names what to mark.
- Claude's card is drawn from the same pool as yours, so the two cards can share numbers; that's how real bingo works too.
- The caller is pseudo-random from the game's seed, which makes a game reproducible from its seed rather than truly random.

## License

MIT, see the repository root.
