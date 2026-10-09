# Roadmap: mods we want to merge

Each entry names the pain it removes and the events and `$` calls that make it work, so you can start from a plan rather than a blank file. Claim one by opening a **Mod idea** issue that links here. Difficulty is a rough guess.

None of these duplicate Anthropic's sample mods (`blast-radius`, `replay-theater`, `token-weather`) or the built-in `/diff` and `cc-plugin-you-should-know`.

## `tripwire` — stop secrets leaving the machine

**Pain.** Claude pastes an API key into a file that's about to be committed, or runs `curl -d @.env`, and nobody notices until the leak scanner emails you.

**How.** `tool.call` on `Edit`, `Write`, and `Bash`. Scan `new_string`, `content`, and `command` for secret patterns (AWS, GitHub, Slack, Stripe, private key blocks, `.env` reads piped to the network). On a hit, hold the call with `$.ui.ask('This looks like a secret. Continue?', ['Refuse', 'Allow once'])`, default to refuse, and return `{ deny }` with the matched pattern's name so Claude rewrites the change. Fails closed under `claude -p`, where `$.ui.ask` rejects. Also hook `tool.call` on `Bash` for `git commit` and `git push` and run a quick scan of staged content with `$.process.run(['git', 'diff', '--cached'])`.

**Difficulty.** Medium. The patterns are the whole product; start with ten high-precision ones.

## `circuit-breaker` — end the doom loop

**Pain.** Claude runs the same failing command five times in a row, burning tokens and your patience, while you're away from the keyboard.

**How.** `tool.call` on `Bash` records `(command, isError)` per turn. When the same command fails N times, hold the next attempt with `$.ui.ask` or return `{ deny: 'This command has failed N times. Stop and explain what you think is wrong before trying again.' }`. A `turn.complete` hook resets the counter. Show the streak in the `Spinner` suffix so the user sees it building. `/breaker 3` sets the threshold via `$.store`.

**Difficulty.** Low. Mostly bookkeeping. The deny text is what makes it work.

## `burn` — live cost and cache meter

**Pain.** Nobody knows what a session cost until the bill, and nobody can see when a change invalidated the prompt cache.

**How.** `turn.step` as an async generator: `const r = yield* next(e)`, then read `r.usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `model`). Keep running totals in `$.state`. Draw a pane opened by `/burn` with per-turn cost, cache hit rate as a `Raster` sparkline in the terminal and text on Desktop, and `$.session.usage()` for context percent and plan limits. Price table in a `userConfig` option so users can override.

**Difficulty.** Medium. The generator hook and surface-specific drawing are the new parts.

## `red-green` — tests run themselves after every turn

**Pain.** Claude says "done", you run the tests, three fail, and you're back to prompting.

**How.** `tool.call` on `Edit` and `Write` marks the turn dirty. `turn.complete` on a dirty turn runs the project's test command with `$.process.run` (detected from `package.json`, `pyproject.toml`, `Makefile`, or set with `/red-green npm test`). Return `{ text }` to show pass/fail under Claude's answer, and draw a `Button` in `AbovePrompt` labelled **Ask Claude to fix** whose `onPress` calls `$.prompt.submit({ text: failures })`. Cap the run with `timeoutMs` and pass `next.signal`.

**Difficulty.** Medium. Test-command detection is the long tail; ship with an explicit `/red-green <cmd>` first.

## `standup` — your day, written for you

**Pain.** Writing the standup update, the changelog entry, or the end-of-day summary of what you and Claude actually did.

**How.** `turn.complete` appends `{ cwd, repo, answer, durationMs, filesTouched }` to `$.store` under today's date. `/standup` reads the day (or `/standup 3` for three days) across every session on the machine, since `$.store` is shared, and asks `$.model.complete({ model: 'haiku', system: 'Write a three-bullet standup update', prompt })`. Optional `--md` writes to a path via `$.fs.write`. Prune entries older than a configurable number of days.

**Difficulty.** Low to medium. Shared-store races are the only subtlety: use one key per session-day.

## `ding` — know when Claude needs you

**Pain.** You tab away during a long task and come back twenty minutes after Claude asked a question.

**How.** `turn.complete` plays a sound with `$.audio.play` and, on macOS and Linux, posts a desktop notification through `$.process.run(['osascript', ...])` or `notify-send`. `tool.call` on `AskUserQuestion` fires a different sound. `userConfig` for sound choice and a quiet-hours window. `/ding off` for the session.

**Difficulty.** Low. The hardest part is doing nothing when the terminal is focused, which `$.session.surfaces()` may help with.

## `gear` — a model and effort dial above the prompt

**Pain.** Switching models for one cheap step means `/model`, a prompt, and `/model` again.

**How.** Draws three plain `Button`s in `AbovePrompt` with digit hotkeys: **1 fast**, **2 balanced**, **3 deep**. The chosen gear is held in `$.state`. `turn.step` rewrites the next request with `next({ ...e, model, effort })`, then resets to the default unless the user pinned it. `agent.spawn` can route subagents the same way. Shows the active gear in the `Spinner` suffix.

**Difficulty.** Low to medium. This is the one mod on the roadmap that draws in the shared `AbovePrompt` band, so it must stay to one line.

## Smaller ideas

- `focus-mode`: hide tool rows with a `ToolUse` render hook until a turn ends.
- `branch-guard`: `tool.check` denies `git push` while on `main`, from the docs example, with a `/branch-guard off`.
- `snippets`: `prompt.submit` expands `!fix`, `!test`, `!explain` into saved templates from `$.store`.
