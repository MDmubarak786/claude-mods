# The mod ecosystem, as of October 9, 2026

What already exists, so a contributor can see where the crowded fields are and where the gaps are. Mods became generally available on October 2, 2026 (Claude Code 2.1.287). The ecosystem is one week old and already dense in a few places.

## Where to look

| Source | What it is | Size |
| :-- | :-- | :-- |
| [karanb192/awesome-claude-code-mods](https://github.com/karanb192/awesome-claude-code-mods) and its [catalogue](https://mods.aidojo.si/) | A scanner that indexes every public GitHub repo containing a hooks module, and records what the validator says each mod reads, writes, runs, or sends. Curated sections on top. | Thousands scanned (2,692 on October 6). The count is inflated by a few multi-plugin repos, one of which contributes around 45 entries on its own. The catalogue's "popular" ranking is repository stars, not mod installs. |
| [whyashthakker/awesome-claude-code-mods](https://github.com/whyashthakker/awesome-claude-code-mods) | 70 small, independent mods in one marketplace: session meters, git browsers, file viewers, workspace notes, utilities, and 20 Desktop-only mods. Plus 14 reviewed community mods. | 70 + 14 |
| [hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods) | Lines above the prompt, guards, panes, and games. The most-starred single-author collection. | A dozen |
| [anthropics/claude-code-playground](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods) | Anthropic's three samples: `blast-radius`, `replay-theater`, `token-weather`. | 3 |
| [anthropics/claude-code `mods/`](https://github.com/anthropics/claude-code/tree/main/mods) | The built-in mods with source: `diff`, `agents-md`, `sec-default`, `telemetry`, and the type declarations. | 4 |
| [MarcoCarnevali/claude-code-mods](https://github.com/MarcoCarnevali/claude-code-mods), [OneWave-AI/claude-code-mods](https://github.com/OneWave-AI/claude-code-mods), [Arunjay4213/claude-mods](https://github.com/Arunjay4213/claude-mods), [hoobnn/hoobnn-agent-mods](https://github.com/hoobnn/hoobnn-agent-mods) | Smaller marketplaces worth knowing by name. | A handful each |

The launch thread, [anthropics/claude-code#91870](https://github.com/anthropics/claude-code/issues/91870), is where people post what they built and what the API can't yet do.

## Crowded fields: don't build another one

- **Usage, cost, and context meters.** `cctop`, `token-ledger`, `context-lens`, `quota-meter`, `burn-meter`, `cache-inspector`, `context-view`, `usage-band`, `weektoken`, `clawd-dash`, `context-bar`, `hud`, `statuspane`, Anthropic's `token-weather`, and more. Every angle is taken: band, pane, sparkline, forecast, Desktop rings.
- **Things to look at while you wait.** Games (`cc-arcade`, `minefield`, Doom twice), pets (`nibbl`, `claude-pokemon`, `clawd-tales`), breathing (`Mindful-Claude`), quotes, stock tickers, music. The one game this repository does ship, [`tool-bingo`](../mods/tool-bingo/), is different in kind: it plays itself from what Claude does, with no input and no tokens, which none of those do.
- **Pull request and CI watchers.** `cc-pr-tracker`, `pr-pulse`, `gh-ci-status`, `review-inbox`, `review-watch`, `github-issues`, `vercel-deploy-status`.
- **Risky-command holds.** Anthropic's `blast-radius`, `launch-codes`, `merge-gate`, a second `blast-radius`.
- **Secret redaction before the model reads.** `secret-redactor`, `honmoon-redact`, `screen-guard`.
- **Model and effort switching.** `effort-cycle`, `model-pick`, `fable-pin`.
- **Rendering replies.** Mermaid (`claude-mermaid`, `gfm-render`), themes (`prismantis`, `skins`, `lemo-mod`), LaTeX, Markdown previews, a terminal browser.
- **Task boards and notes.** `task-board` twice, `pinboard`, `scratchpad`, `decision-log`, `handoff-notes`, `mokkan`.
- **Memory systems.** `lcm`, `segmem`, `kindex`, `remcycle`, `commonplace`.

## Gaps the catalogue doesn't fill

The pattern across the crowded fields is "draw something above the prompt." The band is the most contested surface in the ecosystem, and only one mod can hold it at a time. What's thin is the other half of what mods can do: changing a tool row, stepping into a tool call to fix a bad habit, and checking what Claude claims against what it ran.

Almost nothing in the catalogue addresses the most-reacted open issues on the Claude Code tracker:

| Pain, with evidence | Closest existing mod |
| :-- | :-- |
| Tool rows don't name the file: "Read 1 file" with no path ([#21151](https://github.com/anthropics/claude-code/issues/21151), 186 reactions) | None. `skins` restyles rows but doesn't add the path. |
| Copy from the terminal carries indentation and trailing spaces (299 reactions, top-ten open issue) | `prismantis` has copy controls as part of a theme. Nothing standalone. |
| Claude writes verbose comments and ignores instructions to stop ([#250 by reactions](https://github.com/anthropics/claude-code/issues?q=verbose+code+comments)); overuses "load-bearing" (181 reactions) | None. |
| Claude uses `cat`, `grep`, `find`, `sed` in Bash when Read, Grep, and Glob fit ([#19649](https://github.com/anthropics/claude-code/issues/19649), 120 reactions), which costs permission prompts and context | None. |
| MCP servers consume tens of thousands of tokens before the first prompt | `harness-scope` picks per-repo profiles. No per-tool toggle. |
| False claims about its own work: "verified", "tests pass", "this was approved" ([#69044](https://github.com/anthropics/claude-code/issues/69044)) | `receipt` names an unverified claim in the turn footer. Nothing acts on it. |
| Rules ignored after compaction or across sessions | `context-canary` watches one sentinel; `pinboard` keeps decisions visible. Nothing re-injects instructions. |
| A session can't tell whether its memory index loaded whole or truncated (65-comment thread) | None. |
| No way to undo what the last turn changed without git | Anthropic's `replay-theater` shows the edits; it doesn't revert them. |
| Supply-chain risk when Claude runs `npm install` on a package it guessed | None. |

The [roadmap](roadmap.md) turns each of these into a mod.
