---
name: plugin-ready
description: Make a repository of Claude Code skills installable and updatable through /plugin. Use when the user wants people to install their skills with /plugin marketplace add and /plugin install, asks for a marketplace.json or plugin.json, hears that users never get updates or are stuck on an old version, or wants to publish, version, release, or validate a skills or plugin repo. Also checks skill names against Claude Code's built-in commands.
---

# plugin-ready

Turn a folder of skills into something people can install with two commands and keep up to date. The complaints this fixes recur across the largest skill collections: no `marketplace.json`, so `/plugin` can't install it; a `version` that never moves, so users stay on an old copy forever; a skill named like a built-in command, so it replaces that command for anyone who copies it in.

Work from the repository root. Read, then propose; write only after the user approves or has already said to go ahead. Never push, tag, or publish.

## 1. Inventory

- **Skills**: every `SKILL.md` (under `skills/`, `.claude/skills/`, or anywhere else), with its folder name and frontmatter `name` and `description`.
- **Manifests**: any `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, and their `name` and `version`.
- **History**: if this is a git repository, the commit that last changed each `version`, and whether skill files changed after it (`git log -1 --format=%h -S'"version"' -- <plugin.json>`, then `git diff --stat <that commit> -- <plugin folder>`).
- **Install story**: what the README tells people to do today (copy into `~/.claude/skills/`, `npx`, a marketplace), and the GitHub `owner/repo` from `git remote -v` or the README.
- **Leftovers**: a `commands/` folder duplicating skills, deprecated or renamed skills still shipped.

## 2. Check

Open [references/marketplace.md](references/marketplace.md) for the exact rules and [references/builtins.md](references/builtins.md) for the built-in names.

- **Names.** Plugin, skill, and marketplace names: lowercase letters, digits, and hyphens, no reserved or Anthropic-looking names. A skill whose name matches a built-in command or bundled skill is safe inside a plugin (it runs as `/plugin:skill`) but replaces the built-in for anyone who copies it into `~/.claude/skills/` or a project's `.claude/skills/`. Flag each one and suggest a rename, especially when the README tells people to copy skills in.
- **Frontmatter.** Each `SKILL.md` parses, has a `description` that leads with its use case and fits under 1,536 characters, and a `name` that matches its folder.
- **Versions.** Why updates do or don't reach users, from the rules in the reference: a pinned `version` that hasn't moved since skill files changed means every user is stuck on the old copy.
- **Layout.** One plugin for the whole collection, or one plugin per skill. Recommend one plugin when users want the set together; one per skill when they will pick and choose.

## 3. Propose

Reply with what you found and the change set, then wait for approval unless the user already gave it:

- The layout, and the files to add or change: `.claude-plugin/marketplace.json`, each `.claude-plugin/plugin.json`, the README's install section.
- The version strategy, with one recommendation: **pin and bump** (a `version` in `plugin.json` that moves with every release, plus a check that fails when files change without it) or **track commits** (no `version` anywhere, so every pushed commit is an update). Say which one the repo's release habits fit.
- Each name clash and the rename you suggest. Renaming is the user's call; never rename silently.
- Anything left over to delete or redirect, with `renames` in `marketplace.json` for a plugin that is renamed or removed.

## 4. Apply and verify

Write the files. Bump the version if the strategy is pin-and-bump and files changed since the last bump. In the README, add the install lines and tell users how updates arrive:

```text
/plugin marketplace add <owner>/<repo>
/plugin install <plugin>@<marketplace>
```

Updates: auto-update is off by default for marketplaces other than Anthropic's, so tell users to turn it on under `/plugin`, Marketplaces, or run `/plugin marketplace update <marketplace>`.

Then validate: run `claude plugin validate --strict .` and on each plugin folder if you can run commands; otherwise give the user those commands. Offer, don't add, a CI workflow that runs them and the version check from the reference.

Report what changed, the commands users now run, the version strategy and what the author does on each release, the name clashes and their status, and the validation result or the commands still to run.

## Limits

- Don't push, tag, publish, or submit anywhere. The user does that after reviewing.
- Don't rename a skill or plugin without the user's yes: a rename breaks every existing install and invocation.
- Built-in names change with Claude Code releases. The reference lists them as of one version; tell the user to type `/` in their current version to confirm a clash.
