# claude-mods

[![validate](https://github.com/MDmubarak786/claude-mods/actions/workflows/validate.yml/badge.svg)](https://github.com/MDmubarak786/claude-mods/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Claude Code 2.1.287+](https://img.shields.io/badge/Claude%20Code-2.1.287%2B-d97757.svg)](https://code.claude.com/docs/en/plugins/mods/overview)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Community mods for [Claude Code](https://code.claude.com/docs/en/plugins/mods/overview). A mod is a plugin that runs *inside* Claude Code: it can guard a tool call, draw a pane beside the transcript, add a `/command`, or watch a turn. This repository is a marketplace named **`modhub`**, so every mod here installs with two commands and updates like any other plugin.

> **Mods run with your permissions and are not sandboxed.** Read [Is this safe?](#is-this-safe) before installing anything, here or anywhere else.

## Install

Inside a Claude Code session (v2.1.287 or later):

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install fence@modhub
```

Or from your shell:

```bash
claude plugin marketplace add MDmubarak786/claude-mods
claude plugin install fence@modhub --scope user
```

Run `/reload-plugins` in any session that was already open. To remove a mod, run `/plugin uninstall fence@modhub`. To get updates automatically, open `/plugin`, go to **Marketplaces**, select `modhub`, and enable auto-update.

Try a mod for one session without installing it:

```bash
git clone https://github.com/MDmubarak786/claude-mods.git
cd claude-mods
claude --plugin-dir ./mods/fence
```

## Mods

<!-- mods:start -->
<!-- This table is generated from .claude-plugin/marketplace.json by scripts/update-readme.mjs. Do not edit by hand. -->
| Mod | What it does | Version |
| :-- | :-- | :-- |
| [`big-output`](mods/big-output/) | Keep huge shell output out of the context window. A Bash result over a threshold is saved to a file and Claude gets its head and tail plus a slice tool to grep or page the rest on demand. | 0.1.0 |
| [`circuit-breaker`](mods/circuit-breaker/) | Stop Claude from retrying the same failing shell command over and over. After N identical failures the next attempt is held, and you choose: stop, or try once more. | 0.1.0 |
| [`copy-last`](mods/copy-last/) | Copy Claude's last reply, or its last code block, to the clipboard as clean Markdown with /copy, with no terminal indentation or trailing spaces. | 0.1.0 |
| [`ding`](mods/ding/) | Play a sound and post a desktop notification when Claude finishes a turn or needs you to answer a question or a permission prompt. | 0.1.0 |
| [`fence`](mods/fence/) | Limit which paths Claude may edit in a project with one /fence command. Edits outside the fence are refused with a reason Claude can act on. | 0.1.2 |
| [`mcp-diet`](mods/mcp-diet/) | Choose which MCP tools and subagent types Claude sees, per project. A pane lists every server and tool with the size of its description; defer or hide the ones this repo never needs and stop paying for them on every request. | 0.1.0 |
| [`memory-lint`](mods/memory-lint/) | Know whether your auto-memory index loaded whole. Reports the index's size against a limit you set at every session start, names the entries past the cut, and warns when a session pushes it over. | 0.1.0 |
| [`pins`](mods/pins/) | Pin instructions that survive compaction, /clear, and restarts. /pin saves a rule for this project and every prompt carries the pinned list as context Claude reads. | 0.1.0 |
| [`pkg-guard`](mods/pkg-guard/) | Hold npm, pnpm, yarn, pip, uv, and cargo installs of packages that don't exist, are brand new, or are barely downloaded, with the registry facts in the question. Catches hallucinated and typosquat packages before they land. | 0.1.1 |
| [`red-green`](mods/red-green/) | Run the project's tests after any turn that edited files, print pass or fail under Claude's answer, and send the failure back to Claude with one /fix command. | 0.1.1 |
| [`right-tool`](mods/right-tool/) | Stop Claude using cat, grep, find, and sed in Bash when the Read, Grep, and Glob tools fit. Each redirected call saves a permission prompt and keeps raw shell output out of context. | 0.1.0 |
| [`show-paths`](mods/show-paths/) | Put the file path on every Read, Edit, Write, Glob, and Grep row in the transcript, so you never expand a row just to learn which file it touched. | 0.1.0 |
| [`standup`](mods/standup/) | Your day, written for you. Every turn is logged; /standup turns today's work across every session on the machine into a three-bullet update, or a Markdown file. | 0.1.0 |
| [`style-cop`](mods/style-cop/) | Enforce the style rules Claude keeps ignoring: banned words and phrases, a comment-density cap on added code, and files that must not gain comments. Rules live in .claude/style-cop.md and are both shown to Claude and enforced on edits. | 0.1.0 |
| [`tripwire`](mods/tripwire/) | Stop secrets leaving the machine. Holds an edit or command that writes an API key, a private key, or a credential literal, a command that reads a secret file and talks to the network, and a git commit whose staged changes contain a secret. Refuses by default. | 0.1.0 |
| [`trust-but-verify`](mods/trust-but-verify/) | Check what Claude claims against what it ran. When an answer says the tests pass, the build is clean, or something was committed, a line under it says whether a matching command actually ran this turn and succeeded. | 0.1.0 |
| [`undo-agent`](mods/undo-agent/) | Undo the file edits a subagent made. /rewind restores your own turns, but not a subagent's edits; this snapshots them and puts the files back with one command. | 0.1.1 |
<!-- mods:end -->

Looking for something that isn't here yet? The [roadmap](docs/roadmap.md) lists mods we'd love to merge, each with the events and API calls that make it work.

## Is this safe?

A mod is JavaScript that runs in Claude Code's own process with everything your user account can reach: files, environment variables, network, and the ability to approve tool calls. Treat installing a mod like installing a shell extension from a stranger.

What this repository does about it:

- **Every mod is reviewed against the [review checklist](docs/review-checklist.md)** before it's merged. The checklist is public so you can hold us to it.
- **Every mod's README lists its hooks and calls**, the same lines `claude plugin validate` prints, so you can see what it touches without reading the code.
- **CI runs `claude plugin validate --strict` and `claude plugin test`** on every mod, on every pull request.
- **No mod auto-approves tool calls, reads secrets, or phones home without an explicit, documented opt-in.** See [SECURITY.md](SECURITY.md) for the full policy.

Check any mod yourself before you install it:

```bash
git clone https://github.com/MDmubarak786/claude-mods.git
claude plugin validate ./claude-mods/mods/fence
```

The `hooks:` line lists the events the mod handles and the `calls:` line lists every mods API method it invokes.

## Contribute a mod

```bash
scripts/new-mod.sh my-mod "One sentence saying what it does"
claude --plugin-dir ./mods/my-mod
```

That scaffolds a working mod from [`templates/mod`](templates/mod/), registers it in the marketplace, and validates it. [CONTRIBUTING.md](CONTRIBUTING.md) covers the rest: branches, the README template, tests, version bumps, and what has to pass before merge. Questions go to [Discussions](https://github.com/MDmubarak786/claude-mods/discussions); see [SUPPORT.md](SUPPORT.md).

## Layout

```text
.claude-plugin/marketplace.json   The catalog. One entry per mod.
mods/<name>/                      One complete plugin per directory.
templates/mod/                    What scripts/new-mod.sh copies.
scripts/                          new-mod, try, install, validate, ship, and the checks CI runs.
docs/                             Roadmap, review checklist.
.github/                          CI, labeler, Dependabot, issue forms, PR template, CODEOWNERS.
```

## License

MIT. Each mod carries its own author in its `plugin.json`.
