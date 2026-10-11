# Roadmap: mods we want to merge

Already in the catalog: [`fence`](../mods/fence/), [`circuit-breaker`](../mods/circuit-breaker/), [`ding`](../mods/ding/), [`show-paths`](../mods/show-paths/), [`copy-last`](../mods/copy-last/), [`right-tool`](../mods/right-tool/), [`undo-agent`](../mods/undo-agent/), [`pkg-guard`](../mods/pkg-guard/), [`style-cop`](../mods/style-cop/), [`big-output`](../mods/big-output/), [`pins`](../mods/pins/), [`mcp-diet`](../mods/mcp-diet/), [`memory-lint`](../mods/memory-lint/), [`red-green`](../mods/red-green/), [`standup`](../mods/standup/), [`tripwire`](../mods/tripwire/), [`trust-but-verify`](../mods/trust-but-verify/), [`watchtower`](../mods/watchtower/), [`bingo`](../mods/bingo/), [`xo`](../mods/xo/), [`connect-four`](../mods/connect-four/), [`game-2048`](../mods/game-2048/), [`pairs`](../mods/pairs/), [`snake`](../mods/snake/), [`typing`](../mods/typing/).

Every mod on the first roadmap has shipped. The list below is where the next ones go. An entry needs the same three things the first fourteen had: a problem developers have on record, the closest mod that already exists so the gap is real, and the events and `$` calls that make it work. The [ecosystem survey](ecosystem.md) explains what we deliberately don't build.

**Design rule.** Prefer tool rows, panes, the turn footer, and deny reasons over the band above the prompt. The band is shared, only one mod holds it, and half the ecosystem already fights over it.

Propose one by opening a **Mod idea** issue; a maintainer adds it here once it passes the three checks.

## Wanted

- **`show-paths` for `ToolGroup`**: the collapsed "Read 3 files" row is a separate render site and isn't labeled yet.
- **`tripwire` for `git push`**: scan what the push would publish, not only the commit.
- **`pkg-guard` thresholds as settings**: the 30-day and 100-download cutoffs are fixed today.
- **`red-green` watch mode**: run only the tests that touch the files Claude edited, for large suites.

## Games

Small games to play in a pane while a long turn runs. They share one recipe, worked out on `bingo` and `xo`: rules in a pure `game.ts` the tests import directly, the hooks module keeping the game in `$.state` mirrored to `$.store`, a `/command` that prints a one-line summary where nothing can draw, a how-to box on the first game, and a board built from fixed-width `Box`es with ASCII labels and color for state, because the Desktop surface collapses spaces and draws symbol glyphs wider than a cell. Every one is zero tokens: no model call, no reading what Claude is doing.

All five shipped: `connect-four`, `game-2048`, `pairs`, `snake`, `typing`. Ideas for the next round, none started: hangman on a word list, Wordle with a daily word, Mastermind, Minesweeper with a timer.

Each ships as its own pull request with mounted-pane tests on the mock clock and a look on the Desktop app before merge. Variants left out on purpose: timed bingo, 4x4 tic-tac-toe, multiplayer across sessions.

## Retired from this roadmap

- `burn` (cost and cache meter): the ecosystem has more than a dozen. See the [survey](ecosystem.md).
- `gear` (model and effort dial): `effort-cycle` and `model-pick` already do it.
