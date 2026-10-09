# Roadmap: mods we want to merge

Already in the catalog: [`fence`](../mods/fence/), [`circuit-breaker`](../mods/circuit-breaker/), [`ding`](../mods/ding/), [`show-paths`](../mods/show-paths/), [`copy-last`](../mods/copy-last/).

Every entry below starts from a problem developers have on record, names the closest mod that already exists so you can check it isn't enough, and says which events and `$` calls make it work. The list is ordered smallest first, because a one-hook fix for a 186-reaction annoyance is worth more than a framework. The [ecosystem survey](ecosystem.md) explains what we deliberately don't build.

**Design rule.** Prefer tool rows, panes, the turn footer, and deny reasons over the band above the prompt. The band is shared, only one mod holds it, and half the ecosystem already fights over it.

Claim one by opening a **Mod idea** issue that links here.

## 1. `right-tool` — stop Bash doing Read's job

**Pain.** Claude runs `cat file`, `grep -r`, `find . -name`, and `sed -n 10,20p` in Bash when Read, Grep, and Glob exist. Each costs a permission prompt and dumps raw output into context. [#19649](https://github.com/anthropics/claude-code/issues/19649), 120 reactions.

**What it does.** A `tool.call` hook on Bash recognizes the read-only patterns and refuses them with a precise instruction: "Use Read on src/app.ts lines 10 to 20." Claude complies on the next call. Pipelines and anything with side effects pass through untouched. `/right-tool off` for sessions where you want raw Bash.

**How.** `tool.call` with `{ tool: 'Bash' }`, a small parser for the five patterns, `{ deny }` with the rewritten instruction. Fail closed with `.catch`. Keep a counter and show "redirected N calls" in the turn footer via `turn.complete`.

**Nearest neighbour.** None.

**Size.** Small. The parser is the product; start with five patterns and high precision.

## 2. `undo-turn` — revert what the last turn changed

**Pain.** Claude made six edits across four files and broke something. Reverting means git, if you committed, or hunting through `/diff`.

**What it does.** Snapshots each file before Edit, Write, and NotebookEdit, grouped by turn. `/undo` restores the last turn's files and shows what it put back. `/undo 2` goes two turns back. Keeps the last ten turns.

**How.** `tool.call` on the three tools: `$.fs.read` the file before `next(e)`, write the pre-image to a temp directory with `$.fs.write` (`$.store` is capped at 4 MiB, so it holds only the index). `turn.start` opens a new group. `/undo` rewrites the files and logs each path. Creation of a new file is recorded as "delete on undo."

**Nearest neighbour.** Anthropic's `replay-theater` steps through the edits; it doesn't revert them.

**Size.** Small. Why it spreads: "Claude broke it, `/undo`" is the single most reassuring thing a mod can offer.

## 3. `pkg-guard` — hold installs of packages Claude guessed

**Pain.** Claude runs `npm install some-helper` for a package name it inferred. Typosquats and hallucinated packages are a documented supply-chain vector.

**What it does.** Holds `npm install`, `pnpm add`, `yarn add`, `pip install`, `uv add`, and `cargo add` when a package is not in the lockfile already. Looks it up on the registry, and asks before installing anything that doesn't exist, is under 30 days old, or has very few downloads. Shows name, age, weekly downloads, and repository link in the question.

**How.** `tool.call` on Bash, a parser for the six install forms, `$.http.fetch` to the npm, PyPI, or crates.io JSON API, `$.ui.ask` with "Install" and "Refuse," default refuse. Fail closed. Cache lookups in `$.store` for a day.

**Nearest neighbour.** `launch-codes` and `blast-radius` hold destructive commands. Nothing checks what's being installed.

**Size.** Small. Why it spreads: a security story with a concrete screenshot.

## 4. `style-cop` — enforce the style rules Claude keeps ignoring

**Pain.** Verbose code comments by default, ignoring instructions to stop (250 reactions, the most-reacted model-behaviour issue). "Load-bearing" in every reply (181 reactions). Instructions in CLAUDE.md don't hold.

**What it does.** A `~/.claude/style-cop.md` or project `.claude/style-cop.md` holds rules: banned words and phrases, a maximum comment density for added code, and file patterns that must not gain comments. The mod adds the rules as a system prompt section so Claude sees them every request, and enforces the measurable ones on Edit and Write: an edit whose added lines are more than N% comments is refused with the count, and a banned word in added code is refused with the line.

**How.** `prompt.section` or `prompt.compose` for the rule text. `tool.call` on Edit and Write, a comment-line counter by file extension, `{ deny }` naming the violation. `/style-cop` shows the active rules and the count of refusals.

**Nearest neighbour.** None.

**Size.** Small to medium. Keep enforcement to what can be counted; leave taste to the prompt section.

## 5. `big-output` — keep huge tool output out of context

**Pain.** One `npm test` or `cat package-lock.json` dumps 50 KB into the context window, and it stays there until compaction. Asked for explicitly in the launch thread.

**What it does.** When a Bash result is larger than a threshold, the mod saves the full output to a file, hands Claude the first and last 40 lines plus a line saying where the rest is and how big it is, and registers a tool Claude can call to grep or slice the saved output on demand.

**How.** `tool.call` on Bash: `const r = await next(e)`, then return a copy of `r` whose `result.stdout` is the trimmed text (the Bash result record is `{ stdout, stderr, interrupted }`, so rewriting `stdout` keeps the schema). `$.fs.write` to a temp path. `$.tool.register` for `slice` with `{ id, grep?, from?, to? }`, handled by a second `tool.call` hook on `mcp__big-output__slice`.

**Nearest neighbour.** `micro-compaction` replaces old Read results with placeholders after the fact. Nothing trims at the moment of the call.

**Size.** Medium. The threshold is a `userConfig` option.

## 6. `pins` — instructions that survive compaction and `/clear`

**Pain.** "Don't touch the migrations," said an hour ago, is gone after compaction. Rules ignored across session boundaries is the theme of [#69044](https://github.com/anthropics/claude-code/issues/69044).

**What it does.** `/pin don't touch the migrations` saves an instruction for this project. Every prompt carries the pinned list as context Claude reads but the transcript doesn't show. Pins come back after compaction, `/clear`, and restart. `/pins` opens a pane to edit or drop them.

**How.** `$.store` keyed by project root. `prompt.submit` adds `context: [...(e.context ?? []), pinnedText]`. `classic.SessionStart` with `source` `compact`, `clear`, or `resume` reloads them. A pane with `Input` and per-row delete buttons.

**Nearest neighbour.** `context-canary` watches one sentinel and compacts; `pinboard` keeps decisions visible but doesn't feed them to Claude.

**Size.** Small.

## 7. `mcp-diet` — choose which MCP tools Claude sees, per project

**Pain.** Four MCP servers cost one developer 67,000 tokens before the first prompt. Tool search helps, but you can't say "in this repo, hide the Jira tools."

**What it does.** `/mcp-diet` opens a pane listing every connected server and tool with the size of its description. Toggle a tool or a whole server to **deferred** (Claude sees the name only, until it searches) or **hidden**. Choices are saved per project.

**How.** `tool.describe` returns `{ description, isDeferred }` from the saved choice; a hidden tool gets a one-line description and `isDeferred: true`. `agent.offer` can hide subagent types the same way. `$.tool.list` for the pane. Note for the README: `tool.describe` fires once per tool when its description is first sent, so a change takes effect on the next session, not live.

**Nearest neighbour.** `harness-scope` picks a per-repo profile of skills, agents, and tools from `~/.claude`. No per-tool toggle with sizes.

**Size.** Medium.

## 8. `memory-lint` — know whether your memory index loaded whole

**Pain.** The auto-memory index is read at session start up to a limit, and a session can't tell whether it got the whole file, a truncated one, or nothing. A 65-comment thread asks for the threshold to be visible and configurable.

**What it does.** At session start, reads the project's memory index, reports its size against a limit you set, lists the entries past the cut, and offers a button to open the file. Warns in the turn footer when the index grows past the limit during a session.

**How.** `session.start` and `classic.SessionStart`, `$.fs.read` and `$.fs.stat` on the index path, a `userConfig` option for the limit (the real limit isn't documented, which is the point of the thread, so don't hard-code one), `$.ui.status` for the warning, `$.ui.log` for the list.

**Nearest neighbour.** None.

**Size.** Tiny.

## 9. `red-green` — tests run themselves after every turn

**Pain.** Claude says "done", you run the tests, three fail, and you're back to prompting.

**What it does.** Marks a turn dirty on any edit, runs the project's test command at `turn.complete`, prints pass or fail under Claude's answer, and offers a one-key **Ask Claude to fix** button that submits the failures.

**How.** `tool.call` on Edit and Write sets the flag. `turn.complete` runs `$.process.run` with the command from `/red-green <cmd>` or detected from `package.json`, `pyproject.toml`, or `Makefile`, with `timeoutMs` and `next.signal`. Returns `{ text }`. The button calls `$.prompt.submit({ text })`.

**Nearest neighbour.** `test-ledger` and `boss-fight` observe the test commands Claude runs. Nothing runs them for you.

**Size.** Medium.

## 10. `standup` — your day, written for you

**Pain.** Writing the standup update, the changelog entry, or the end-of-day summary of what you and Claude actually did, across several repos.

**What it does.** Logs each turn's repo, files touched, and answer to the shared store. `/standup` reads today across every session on the machine and asks Haiku for a three-bullet update. `/standup 3` covers three days. `--md` writes it to a file.

**How.** `turn.complete` to `$.store` under one key per session-day (avoids the shared-store race). `$.model.complete` with `model: 'haiku'`. `$.fs.write` for the file. Prune after a configurable number of days.

**Nearest neighbour.** `session-wrapped` makes a recap card for one session. `handoff-notes` is manual.

**Size.** Small to medium.

## 11. `tripwire` — stop secrets leaving the machine

**Pain.** Claude pastes a key into a file that's about to be committed, or runs `curl -d @.env`.

**What it does.** Scans Edit, Write, and Bash for secret patterns and for `.env` reads piped to the network, holds the call with a question, and refuses by default. Before `git commit` and `git push`, scans the staged diff.

**How.** `tool.call` on Edit, Write, and Bash with ten high-precision patterns. `$.ui.ask` with refuse as the default; fails closed under `claude -p`. `$.process.run(['git', 'diff', '--cached'])` before a commit.

**Nearest neighbour.** `secret-redactor` and `honmoon-redact` hide secrets from the model's reads. `launch-codes` holds risky commands. The gap is the write and send side: secrets going into a commit or out on the network.

**Size.** Medium.

## 12. `trust-but-verify` — check what Claude claims against what it ran

**Pain.** "Tests pass." No test command ran. "Verified in the browser." No browser tool was called. "This was approved earlier." It wasn't. [#69044](https://github.com/anthropics/claude-code/issues/69044) documents months of it.

**What it does.** At the end of a turn, compares claims in the answer ("tests pass", "verified", "confirmed", "ran", "builds") against the turn's tool calls and their results. Prints a one-line verdict under the answer. Optionally, once per turn, starts a follow-up: "You said the tests pass, but no test command ran this turn. Run them now."

**How.** `tool.call` records each call and `isError` per turn. `turn.complete` reads `e.answer`, matches claim phrases, and returns `{ text }`. The follow-up is `$.prompt.submit`, gated by a `userConfig` toggle and a once-per-turn guard, because it starts a turn and spends tokens. A Haiku call via `$.model.complete` can classify claims more precisely than regexes; make it opt-in.

**Nearest neighbour.** `receipt` names an unverified claim in the turn footer. This acts on it.

**Size.** Medium, and the riskiest entry here: it can nag. Ship the verdict line first and the follow-up behind a flag.

## Retired from this roadmap

- `burn` (cost and cache meter): the ecosystem has more than a dozen. See the [survey](ecosystem.md).
- `gear` (model and effort dial): `effort-cycle` and `model-pick` already do it.
