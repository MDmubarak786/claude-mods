# pairs

Memory pairs in a pane beside the conversation. Sixteen cards lie face down, eight matching pairs. Press a card's letter to turn it, find its twin, and clear the board in as few turns as you can. Your fewest is kept.

It's a game you play, not a watcher: it never calls a model, never reads what Claude is doing, and costs no tokens. A good one for a child at the keyboard while a long turn runs.

```text
PAIRS  turns 5  found 2/8  best 11 · game 3
Not a pair. They turn back in a moment.

  @    b    c    #
  e    *    g    h
  @    j    k    #
  m    +    o    p

r: New deal   t: How to play   Esc closes
```

The cards are colored, which the text above can't show: a card that is up sits on yellow, a found pair on green, and face-down cards show their key dim. On the Desktop app each face-down card is a button with its letter as a key badge; in a terminal the letter is the label.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install pairs@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/pairs
```

## How to play

1. Run `/pairs`. The pane opens with sixteen face-down cards. A fresh deal shows a short how-to until your first card; **t** hides or shows it any time.
2. Press a card's letter, **a** to **p** in reading order, or click it. The card turns over and shows one of eight symbols.
3. Turn a second card. A pair stays up on green. Two different cards stay up for a moment so you can remember them, then turn back; turning a third card turns them back at once.
4. Every second card is a turn. Find all eight pairs and the status line says how many turns it took and whether that's your best.
5. **r** deals a new game. Esc closes the pane; the deal is saved on every turn.

The keys work while the pane has the focus. If pressing a letter types into the prompt instead, click the pane first.

| Command | What it does |
| :-- | :-- |
| `/pairs` | Open the pane. Where no pane can be drawn, print how far the deal has got. |
| `/pairs new` | Deal a new game. |
| `/pairs stats` | Games dealt, games finished, fewest turns. |

## What it touches

From `claude plugin validate ./mods/pairs`:

```text
hooks: session.start, classic.SessionStart{source=clear|resume|fork}, command.run{command=pairs}, ui.close{id=pairs}, ui.render{component=Pane}
calls: $.clock.after (via scheduleHide), $.clock.now (via load, startNew), $.command.register, $.session.surfaces, $.state.get, $.state.set, $.store.get (via load), $.store.set (via save), $.ui.invalidate, $.ui.log, $.ui.open, $.ui.resolve, $.ui.toast
```

- **`$.store`** keeps the deal, which cards are up, and the record, so a game survives a restart. A mismatched pair left up across a restart turns back down on load. If the store can't be read at start, the mod plays in memory and writes nothing over the saved record.
- **`$.clock`** seeds each deal and turns a mismatched pair back down after 0.9 seconds. The timer is cancelled by the next turn, a new deal, and closing the pane.
- **`ui.close`** is observed to cancel that timer and turn the pair down.
- No tool calls are observed, no files, processes, model calls, or network.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` passing: the shuffle, turning, a miss and a match, finishing with the fewest-turns record, mounted pane tests for the keys, the pause on the mock clock, a third card cutting the pause short, the status lines, the commands, an unreadable store, and a narrow pane. The test kit can't fire `ui.close`, so the pair turning down on close is covered by the load path.
- Played in the Desktop app, 2.1.293, through hot reloading.

## Limitations

- One game at a time per machine. Two sessions playing at once overwrite each other; the last write wins.
- The keys **n** and **h** belong to cards here, so a new deal is **r** and the how-to is **t**, unlike the other game mods.

## License

MIT, see the repository root.
