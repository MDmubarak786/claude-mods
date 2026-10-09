# claude-mods

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
| [`circuit-breaker`](mods/circuit-breaker/) | Stop Claude from retrying the same failing shell command over and over. After N identical failures the next attempt is held, and you choose: stop, or try once more. | 0.1.0 |
| [`copy-last`](mods/copy-last/) | Copy Claude's last reply, or its last code block, to the clipboard as clean Markdown with /copy, with no terminal indentation or trailing spaces. | 0.1.0 |
| [`ding`](mods/ding/) | Play a sound and post a desktop notification when Claude finishes a turn or needs you to answer a question or a permission prompt. | 0.1.0 |
| [`fence`](mods/fence/) | Limit which paths Claude may edit in a project with one /fence command. Edits outside the fence are refused with a reason Claude can act on. | 0.1.1 |
| [`right-tool`](mods/right-tool/) | Stop Claude using cat, grep, find, and sed in Bash when the Read, Grep, and Glob tools fit. Each redirected call saves a permission prompt and keeps raw shell output out of context. | 0.1.0 |
| [`show-paths`](mods/show-paths/) | Put the file path on every Read, Edit, Write, Glob, and Grep row in the transcript, so you never expand a row just to learn which file it touched. | 0.1.0 |
| [`undo-agent`](mods/undo-agent/) | Undo the file edits a subagent made. /rewind restores your own turns, but not a subagent's edits; this snapshots them and puts the files back with one command. | 0.1.0 |
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

That scaffolds a working mod from [`templates/mod`](templates/mod/), registers it in the marketplace, and validates it. [CONTRIBUTING.md](CONTRIBUTING.md) covers the rest: the README template, tests, version bumps, and what reviewers look for.

## Layout

```text
.claude-plugin/marketplace.json   The catalog. One entry per mod.
mods/<name>/                      One complete plugin per directory.
templates/mod/                    What scripts/new-mod.sh copies.
scripts/                          new-mod, validate, try, install, update-readme.
docs/                             Roadmap, review checklist.
.github/                          CI, issue and PR templates, CODEOWNERS.
```

## License

MIT. Each mod carries its own author in its `plugin.json`.
