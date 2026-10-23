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

Already in the catalog: [`vet-plugin`](../skills/vet-plugin/), [`guard-setup`](../skills/guard-setup/).

The next three come from the most-reacted issues in the five largest skill collections, read in October 2026: Jesse Vincent's `obra/superpowers`, Matt Pocock's `mattpocock/skills`, Anthropic's `anthropics/skills`, Addy Osmani's `addyosmani/agent-skills`, and `vercel-labs/agent-skills`. Each answers a complaint that recurs across them and that no built-in command fixes.

- **`skill-diet`**: restructure a bloated skill so it loads only what a task needs: a short `SKILL.md` that routes to reference files by topic, duplicates removed, nothing linked that pulls a whole manual into context. It reports the token cost before and after from `claude plugin details`. The skill-side twin of [`mcp-diet`](../mods/mcp-diet/).
  - Evidence: [obra/superpowers#743](https://github.com/obra/superpowers/issues/743), responses slow down after installing the skills (32 reactions); [anthropics/skills#1486](https://github.com/anthropics/skills/issues/1486), the `claude-api` skill loads about 320k tokens (15); [vercel-labs/agent-skills#169](https://github.com/vercel-labs/agent-skills/issues/169), a 2,975-line file linked from `SKILL.md` (16), and [#65](https://github.com/vercel-labs/agent-skills/issues/65), follow progressive disclosure (10).
  - Nearest: `/skill-doctor` reports each skill's cost and usage and says where to turn one off, but doesn't change the skill. The `skill-creator` plugin writes skills; it doesn't slim an existing one.
- **`plugin-ready`**: turn a folder of skills into something people can install and keep updated: a `marketplace.json`, a `version` in each `plugin.json` with a check that it moves when files change, names checked against Claude Code's built-in commands, strict validation, and install lines in the README. What this repository's `ship.sh`, `check-version-bump.sh`, and `validate.sh` do, as a skill for any author.
  - Evidence: [mattpocock/skills#21](https://github.com/mattpocock/skills/issues/21), add a `marketplace.json` (58 reactions), and [#312](https://github.com/mattpocock/skills/issues/312) (18); [#1164](https://github.com/mattpocock/skills/issues/1164), the plugin stays on an old version (31); [#483](https://github.com/mattpocock/skills/issues/483), a `/code-review` skill replaced the built-in command (43); [vercel-labs/agent-skills#20](https://github.com/vercel-labs/agent-skills/issues/20), versioning and marketplace support (22); [obra/superpowers#756](https://github.com/obra/superpowers/issues/756), deprecated commands still shipped (36). This repository hit the same name clash when Claude Code shipped `/copy`.
  - Nearest: the built-in `plugin-authoring` skill builds mods, not releases; `claude plugin validate` checks one plugin, not versions across releases or names against built-ins.
- **`trigger-test`**: find out whether a skill fires when it should and stays quiet when it shouldn't. It writes eval cases in a user's words, a prompt that should invoke the skill and a nearby one that must not, runs them with `claude plugin eval`, and proposes description edits until both pass. This repository's own skills are tested this way.
  - Evidence: [anthropics/skills#556](https://github.com/anthropics/skills/issues/556), `skill-creator`'s `run_eval.py` scored 0% on 144 queries, including an explicit request to run the skill. "Skill not triggering" is the first troubleshooting entry on the Claude Code skills page.
  - Nearest: `skill-creator` tunes descriptions with its own eval format and script, the one that issue reports broken. `claude plugin eval` is the native runner, but writing cases and graders for it is manual.

Considered and left out: an interview skill that asks fewer questions. The complaints are real ([mattpocock/skills#44](https://github.com/mattpocock/skills/issues/44), "200 questions"; [#831](https://github.com/mattpocock/skills/issues/831); [obra/superpowers#2530](https://github.com/obra/superpowers/issues/2530)), but the fix belongs in those skills, and the field is held by the two largest collections. `release-notes`, planned earlier, is dropped: no issue in any of the five asks for it.

Also from this reading, for `vet-plugin` 0.2.0: flag a skill that fetches instructions from a URL each time it runs, which lets whoever controls that URL change what every user's agent does ([vercel-labs/agent-skills#91](https://github.com/vercel-labs/agent-skills/issues/91)), and check a plugin's skill and command names against Claude Code's built-ins.

## Retired from this roadmap

- `burn` (cost and cache meter): the ecosystem has more than a dozen. See the [survey](ecosystem.md).
- `gear` (model and effort dial): `effort-cycle` and `model-pick` already do it.
