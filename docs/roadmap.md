# Roadmap: mods we want to merge

Already in the catalog: [`fence`](../mods/fence/), [`circuit-breaker`](../mods/circuit-breaker/), [`ding`](../mods/ding/), [`show-paths`](../mods/show-paths/), [`copy-last`](../mods/copy-last/), [`right-tool`](../mods/right-tool/), [`undo-agent`](../mods/undo-agent/), [`pkg-guard`](../mods/pkg-guard/), [`style-cop`](../mods/style-cop/), [`big-output`](../mods/big-output/), [`pins`](../mods/pins/), [`mcp-diet`](../mods/mcp-diet/), [`memory-lint`](../mods/memory-lint/), [`red-green`](../mods/red-green/), [`standup`](../mods/standup/).

Every entry below starts from a problem developers have on record, names the closest mod that already exists so you can check it isn't enough, and says which events and `$` calls make it work. The list is ordered smallest first, because a one-hook fix for a 186-reaction annoyance is worth more than a framework. The [ecosystem survey](ecosystem.md) explains what we deliberately don't build.

**Design rule.** Prefer tool rows, panes, the turn footer, and deny reasons over the band above the prompt. The band is shared, only one mod holds it, and half the ecosystem already fights over it.

Claim one by opening a **Mod idea** issue that links here.

## 1. `tripwire` — stop secrets leaving the machine

**Pain.** Claude pastes a key into a file that's about to be committed, or runs `curl -d @.env`.

**What it does.** Scans Edit, Write, and Bash for secret patterns and for `.env` reads piped to the network, holds the call with a question, and refuses by default. Before `git commit` and `git push`, scans the staged diff.

**How.** `tool.call` on Edit, Write, and Bash with ten high-precision patterns. `$.ui.ask` with refuse as the default; fails closed under `claude -p`. `$.process.run(['git', 'diff', '--cached'])` before a commit.

**Nearest neighbour.** `secret-redactor` and `honmoon-redact` hide secrets from the model's reads. `launch-codes` holds risky commands. The gap is the write and send side: secrets going into a commit or out on the network.

**Size.** Medium.

## 2. `trust-but-verify` — check what Claude claims against what it ran

**Pain.** "Tests pass." No test command ran. "Verified in the browser." No browser tool was called. "This was approved earlier." It wasn't. [#69044](https://github.com/anthropics/claude-code/issues/69044) documents months of it.

**What it does.** At the end of a turn, compares claims in the answer ("tests pass", "verified", "confirmed", "ran", "builds") against the turn's tool calls and their results. Prints a one-line verdict under the answer. Optionally, once per turn, starts a follow-up: "You said the tests pass, but no test command ran this turn. Run them now."

**How.** `tool.call` records each call and `isError` per turn. `turn.complete` reads `e.answer`, matches claim phrases, and returns `{ text }`. The follow-up is `$.prompt.submit`, gated by a `userConfig` toggle and a once-per-turn guard, because it starts a turn and spends tokens. A Haiku call via `$.model.complete` can classify claims more precisely than regexes; make it opt-in.

**Nearest neighbour.** `receipt` names an unverified claim in the turn footer. This acts on it.

**Size.** Medium, and the riskiest entry here: it can nag. Ship the verdict line first and the follow-up behind a flag.

## Retired from this roadmap

- `burn` (cost and cache meter): the ecosystem has more than a dozen. See the [survey](ecosystem.md).
- `gear` (model and effort dial): `effort-cycle` and `model-pick` already do it.
