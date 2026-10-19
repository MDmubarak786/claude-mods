# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Note: the surfaces are not HTML pages. Every mod draws into Claude Code's own surfaces (a pane beside the conversation, the band above the prompt, toasts, the status line) from `Box`, `Text` and `Button` primitives. The same tree is drawn by the terminal and by the Claude Code Desktop app, which renders it itself: it collapses whitespace like HTML, draws non-ASCII glyphs in a wider fallback face, and shows a Button's hotkey as a key badge. No CSS, no DOM, no images.

## Users

Developers who use Claude Code, in two situations:

- Reading the repository or a LinkedIn/X post about it: they judge a mod by its demo GIF and the first screen the pane shows. For the games this is the main audience (confirmed 2026-10-19 for `dino`: "mostly a showcase of what a mod can draw").
- Waiting while Claude works on a long task: they open a game in a pane for a short break and close it when the turn ends.

Secondary: people writing their own mod, who read a shipped mod as a worked example of the recipe.

## Product Purpose

`claude-mods` (marketplace `modhub`, 27 mods) is a catalog of small, single-purpose changes to Claude Code's interface and behaviour: guards (`fence`, `tripwire`, `pkg-guard`), tool-row helpers, and nine games that play in a pane. Success is a mod that installs with one command, draws correctly on both surfaces, and makes someone want to try the next one.

## Positioning

The games run inside the coding tool itself, beside the conversation, and cost zero tokens: nothing calls the model, reads what Claude is doing, or leaves the machine. Each game ships with a pure rules module the tests import directly, mounted-pane tests on a mock clock, and a demo GIF recorded from a real session.

## Operating Context

- Installed with `/plugin marketplace add MDmubarak786/claude-mods` then `/plugin install <mod>@modhub`; tried for one session with `claude --plugin-dir ./mods/<mod>`.
- A game opens with its slash command (`/dino`) into a pane whose `rows` the mod requests; keys work while the pane is focused. Esc closes the pane and pauses the game.
- Panes are character-cell grids. A "pixel" is a fixed-width `Box` with a `backgroundColor`; hex colors and theme keys (`success`, `warning`, `error`, `suggestion`, `claude`, `inactive`, `inverseText`) both work on the Desktop. `width`, `height`, `justifyContent`, `borderStyle` and `backgroundColor` on Box are in use by shipped games.
- Demo GIFs are recorded in a terminal with expect + asciinema + agg, so the terminal rendering is what the repository shows.

## Capabilities and Constraints

- Keys are fixed per game and documented in each README; for `dino`: w jump, p pause/resume, n new game, h help, Esc close (confirmed 2026-10-19 as the one thing a redesign must keep).
- Alignment must come from fixed-width Boxes and color, never from padded text or symbol glyphs; labels are ASCII.
- A game's rules live in `hooks/game.ts`, pure, with tests; the pane code in `hooks/register.ts` only draws and handles keys. Tests pin a few on-screen strings per game.
- `claude plugin test` has a 5 s per-test limit and CI is about three times slower than a laptop.
- Open: whether a pane may ask for more than about 30 rows on the Desktop without scrolling.

## Brand Commitments

Repository name `claude-mods`, marketplace name `modhub`, mod names lowercase. Voice in READMEs and posts: plain, specific, first person, no hype. No Claude/AI attribution anywhere in git history.

## Evidence on Hand

- Demo GIFs for the hero and all nine games under `mods/<name>/screenshots/` and `docs/media/`.
- Test suites per mod under `mods/<name>/tests/`.
- Launch posts and their numbers in `launch-posts.md` (Snake ~2.6k impressions, Connect Four ~1.4k, in the first days).
- No user testimonials or download counts on file; do not invent them.

## Product Principles

- The first screen must show the mod doing its job; a game opens on the game, not on instructions.
- One drawing that holds on both surfaces beats two tuned ones.
- Zero tokens is a feature: never trade it for a nicer effect.
- Every visible state (fresh, running, paused, over, record) is distinguishable without reading a sentence.
- Ship with tests and a GIF, or it is not shipped.
