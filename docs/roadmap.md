# Roadmap: mods we want to merge

Already in the catalog: [`fence`](../mods/fence/), [`circuit-breaker`](../mods/circuit-breaker/), [`ding`](../mods/ding/), [`show-paths`](../mods/show-paths/), [`copy-last`](../mods/copy-last/), [`right-tool`](../mods/right-tool/), [`undo-agent`](../mods/undo-agent/), [`pkg-guard`](../mods/pkg-guard/), [`style-cop`](../mods/style-cop/), [`big-output`](../mods/big-output/), [`pins`](../mods/pins/), [`mcp-diet`](../mods/mcp-diet/), [`memory-lint`](../mods/memory-lint/), [`red-green`](../mods/red-green/), [`standup`](../mods/standup/), [`tripwire`](../mods/tripwire/), [`trust-but-verify`](../mods/trust-but-verify/), [`watchtower`](../mods/watchtower/), [`bingo`](../mods/bingo/), [`xo`](../mods/xo/), [`connect-four`](../mods/connect-four/).

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

In build order:

1. **`connect-four`**: 7 columns by 6 rows, press 1 to 7 to drop a disc, Claude answers with `xo`'s three levels; hard is minimax to a fixed depth with a simple line-count heuristic. Discs are `X` and `O` on colored cells, the winning four lit. Events and calls as `xo`.
2. **`2048`**: a 4x4 board, `w a s d` hotkeys slide and merge, a seeded spawn so a game replays from its seed, undo one move, best score in the store. Tiles are numbers right-aligned in 6-wide Boxes, colored by value in steps.
3. **`pairs`**: a 4x4 memory grid of hidden letters; press two digits or letters to flip, a mismatch turns back after a short `$.clock.after`, moves and best score kept. Letters `a` to `p` as hotkeys; the pane holds the focus so digits and letters don't reach the prompt.
4. **`snake`**: a 20 by 10 board ticking on `$.clock.every` (150 ms, slower on `/snake speed`), `w a s d` steer, `#` body and `@` head on a colored board, food as `*`, high score in the store. The timer stops on `ui.close` and on game over, as `bingo`'s caller does.
5. **`typing`**: a short snippet from a built-in list of code lines, typed into the pane's `Input`; the row above it colors each character right or wrong as you go through `onInput`, and Enter scores words per minute and accuracy, with the last ten runs kept. Esc returns the focus to the prompt.

Each ships as its own pull request with mounted-pane tests on the mock clock and a look on the Desktop app before merge. Variants left out on purpose: timed bingo, 4x4 tic-tac-toe, multiplayer across sessions.

## Retired from this roadmap

- `burn` (cost and cache meter): the ecosystem has more than a dozen. See the [survey](ecosystem.md).
- `gear` (model and effort dial): `effort-cycle` and `model-pick` already do it.
