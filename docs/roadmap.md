# Roadmap: mods we want to merge

Already in the catalog: [`fence`](../mods/fence/), [`circuit-breaker`](../mods/circuit-breaker/), [`ding`](../mods/ding/), [`show-paths`](../mods/show-paths/), [`copy-last`](../mods/copy-last/), [`right-tool`](../mods/right-tool/), [`undo-agent`](../mods/undo-agent/), [`pkg-guard`](../mods/pkg-guard/), [`style-cop`](../mods/style-cop/), [`big-output`](../mods/big-output/), [`pins`](../mods/pins/), [`mcp-diet`](../mods/mcp-diet/), [`memory-lint`](../mods/memory-lint/), [`red-green`](../mods/red-green/), [`standup`](../mods/standup/), [`tripwire`](../mods/tripwire/), [`trust-but-verify`](../mods/trust-but-verify/), [`watchtower`](../mods/watchtower/), [`bingo`](../mods/bingo/), [`xo`](../mods/xo/), [`connect-four`](../mods/connect-four/), [`game-2048`](../mods/game-2048/), [`pairs`](../mods/pairs/), [`snake`](../mods/snake/), [`typing`](../mods/typing/), [`sudoku`](../mods/sudoku/).

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

All five shipped: `connect-four`, `game-2048`, `pairs`, `snake`, `typing`. The second round added `sudoku`, with a seeded generator that keeps one solution per puzzle; a Chrome-style dinosaur runner was tried and taken out again. Ideas after that, none started: Wordle on programming words with a daily puzzle, Mastermind against Claude, Battleship against Claude, Minesweeper with a timer, checkers.

Each ships as its own pull request with mounted-pane tests on the mock clock and a look on the Desktop app before merge. Variants left out on purpose: timed bingo, 4x4 tic-tac-toe, multiplayer across sessions.

## Skills

A skill is a page Claude reads when a task matches its description: no hooks, no code in Claude Code's process, a few hundred tokens in every session and a few thousand when it runs. They live under `skills/<name>/`, one plugin each, and install like a mod. A skill earns a place here with three things: a task Claude gets wrong or slow without it, the nearest official plugin or built-in skill and why it isn't enough, and the eval cases (a prompt that should invoke it, one that must not) that show the difference.

Planned, in order:

- **`vet-plugin`**: audit any Claude Code plugin before installing it, from a folder or a `name@marketplace` id. For a mod, the `hooks:` and `calls:` lines against its README and the fail-closed rules; for a skill, the tools it grants, the files it bundles, and any text that overrides your instructions; for a hooks plugin, every shell command; for an MCP server, the command and headers. Ends with install or don't, against this repository's review checklist and security policy. Nearest: the ecosystem's static scanner (GitHub only) and the built-in `plugin-authoring` skill (for authors, not installers).
- **`guard-setup`**: read a repository and draft the per-project setup the guard mods need: a `.claude/style-cop.md`, the `red-green` test command, and the exact `/fence` and `/pin` commands to paste. Says which of the four mods aren't installed. Nearest: `claude-md-management`, which edits `CLAUDE.md`, not mod settings.
- **`release-notes`** (maybe): draft release notes from the pull requests merged since the last tag. Generic, and dropped if the first two prove the path and the queue is better spent on mods.

## Retired from this roadmap

- `burn` (cost and cache meter): the ecosystem has more than a dozen. See the [survey](ecosystem.md).
- `gear` (model and effort dial): `effort-cycle` and `model-pick` already do it.
