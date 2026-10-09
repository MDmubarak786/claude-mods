# watchtower

One line above the prompt showing what your guard mods are doing right now. Claude Code draws nothing there by default, and the other mods in this repository each report in their own place: a dialog, a line under the answer, a command reply. watchtower gathers that into one line you can read at a glance, so you know a fence is limiting edits or a test run just failed without typing a command.

```text
watchtower │ fence src +1 │ pins 2 │ breaker 3 │ tests ✘ │ blocked 3: right-tool 2, fence 1 │ 1 unverified claim
```

It shows only what's active and stays out of the way when nothing is. Anything else a mod draws in the band stays, below this line.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install watchtower@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/watchtower
```

It has nothing to show until at least one of the mods below is installed.

## What each part means

| Part | Shown when | From |
| :-- | :-- | :-- |
| `fence src +1` | A fence is set for this project. The first allowed path, and how many more. | [fence](../fence/) |
| `pins 2` | The project has pinned instructions. | [pins](../pins/) |
| `breaker 3` | circuit-breaker is loaded: the threshold, or `breaker off`. | [circuit-breaker](../circuit-breaker/) |
| `tests: npm test`, then `tests ✔` or `tests ✘` | red-green has a test command and is on. Once a run is seen this session, its result. | [red-green](../red-green/) |
| `blocked 3: right-tool 2, fence 1` | A guard mod refused a call this session: fence, right-tool, pkg-guard, tripwire, circuit-breaker, style-cop, or undo-agent. | Each refusal |
| `1 unverified claim` | trust-but-verify flagged a claim this session. | [trust-but-verify](../trust-but-verify/) |

In a narrow window, parts that don't fit are dropped from the end rather than wrapped.

| Command | What it does |
| :-- | :-- |
| `/watchtower` | The full status, one mod per line, including the ones that aren't loaded. |
| `/watchtower off` | Hide the band. Remembered across sessions. |
| `/watchtower on` | Show it again. |

## What it touches

From `claude plugin validate ./mods/watchtower`:

```text
hooks: session.start, command.run{command=watchtower}, session.append, turn.complete, ui.render{component=AbovePrompt}
calls: $.clock.after, $.clock.every, $.command.list (via refresh), $.command.register, $.fs.list (via refresh), $.fs.read (via storeOf), $.process.run, $.session.root, $.state.get, $.state.set, $.store.get, $.store.set, $.ui.log, $.ui.resolve
```

- **Reads the other mods' saved settings.** fence, pins, circuit-breaker, and red-green keep their settings in their own small JSON files under `~/.claude/plugins/store/`. watchtower finds those files with `$.fs.list` and reads them with `$.fs.read`. It never writes to them, and it reads no other plugin's files. The settings it reads are paths, counts, a number, and a test command, not secrets.
- **`$.process.run`** runs `printenv HOME` once at session start to find that folder. Nothing else is run.
- **`session.append`** sees each row the conversation saves, and passes every one through unchanged. watchtower counts only rows that a guard mod's refusal, a red-green verdict, or a trust-but-verify flag produced.
- **`$.command.list`** tells it which of the mods are loaded, so it never shows a part for a mod you don't have.
- **`$.clock`** re-reads the settings shortly after start and every 15 seconds, so a change made in another session shows up.
- **`$.store`** holds the hidden flag. No network.

## Tested with

- Claude Code 2.1.295, with `claude plugin validate --strict` and `claude plugin test` passing, including mounted band tests at full and narrow widths. Loaded into a Desktop app 2.1.293 session through hot reloading; how the band looks there is still to be confirmed with a screenshot.

## Limitations

- **Reading other mods' store files depends on how Claude Code lays them out today:** one JSON file per plugin, named `<plugin>_<marketplace>-<hash>.json`. If that changes in a future release, the settings parts disappear until watchtower is updated; the session counts keep working.
- Counts start when the session starts. A refusal from an earlier session isn't counted.
- The test result is the last red-green verdict seen as a row in this session. A run in another session isn't shown.
- Only one line of the band is used, so in a very narrow window it may show the name and nothing else.

## License

MIT, see the repository root.
