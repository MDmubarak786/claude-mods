---
name: guard-setup
description: Set up the modhub guard mods for the current project by reading its files: the paths Claude may edit (fence), the rules that must survive compaction (pins), a .claude/style-cop.md of banned phrases and comment limits (style-cop), and the test command to run after every edit (red-green). Use when the user asks to set up, configure, or tune fence, pins, style-cop, or red-green, to keep Claude out of certain folders, to stop verbose comments or banned words, to keep a rule across compaction or restarts, or to run the tests after each edit. Proposes first; writes one file on approval and gives the slash commands to paste.
---

# guard-setup

Four mods from the modhub marketplace guard a project, and each needs a per-project setting that people skip: `fence` wants the paths Claude may edit, `pins` wants the rules that must outlive compaction, `style-cop` wants a `.claude/style-cop.md`, and `red-green` wants the test command. This skill reads the repository and drafts all four, so the setup takes one approval instead of four guesses.

What you can and can't do, and say so in the reply:

- You **write** one file, `.claude/style-cop.md`, and only after the user approves the draft.
- The fence, the pins, and the test command live in each mod's own store and are set with `/fence`, `/pin`, and `/red-green`, which only the user can run. You **print** those commands, ready to paste. Never claim they are set.
- You never edit `settings.json`, install a plugin, or run the test command yourself.

## 1. Read the project

Work from the project root. Read, don't guess:

- **Layout.** Top-level folders and the main source, test, docs, and config folders. Note generated or vendored folders (`dist`, `build`, `node_modules`, `.next`, `target`, `vendor`, coverage), lockfiles, migrations, fixtures and snapshots, CI config, and anything `.gitignore` excludes.
- **Test command.** `package.json` scripts (`test`, and the package manager from the lockfile: `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb`), `pyproject.toml` or `pytest.ini`, `Cargo.toml`, `go.mod`, a `Makefile` target, or a CI workflow's test step. Prefer the command CI runs.
- **Existing rules.** `CLAUDE.md` and `.claude/*.md`, `CONTRIBUTING.md`, lint and formatter configs. Rules already written there are what the pins and `style-cop` should enforce, not duplicate in different words.
- **What is installed.** `enabledPlugins` in `.claude/settings.json`, `.claude/settings.local.json`, and `~/.claude/settings.json`. The four keys are `fence@modhub`, `pins@modhub`, `style-cop@modhub`, `red-green@modhub`. A missing or `false` key means not installed here.

If the user named what they want ("keep Claude out of migrations", "no comments in JSON"), that comes first and the repository fills in the rest.

## 2. Draft the four settings

[references/guards.md](references/guards.md) has each mod's exact syntax and the defaults to start from. In short:

- **fence**: the folders the user's work lives in, as relative paths from the root, usually source and tests. Leave out lockfiles, generated folders, migrations, CI config, and secrets. If the user hasn't said where they work, propose the source and test folders and ask.
- **pins**: two to five short rules, each one that would be lost after compaction and that Claude must obey every turn. Take them from `CLAUDE.md` and conventions you can see (the test command to run before saying done, folders not to touch, the commit title format, the package manager). Not style rules, those go to `style-cop`.
- **style-cop**: `banned:` phrases, a `max-comment-ratio:`, `no-comments-in:` globs for files where comments don't belong (JSON, lockfiles, migrations, generated code), and `rule:` lines for style advice found in `CLAUDE.md`.
- **red-green**: the test command, exactly as CI runs it, or `/red-green detect` when the project is one of the kinds it detects and nothing in CI says otherwise.

## 3. Propose, then act on approval

Reply with the draft in this shape, and stop for the user's answer:

```markdown
## guard-setup: <project name>

Installed here: <the four, each installed or not; an install line for each missing one>

**fence** (paste): `/fence <paths>`
Left out: <what, and why>

**pins** (paste, one per line):
`/pin <rule>`
...

**style-cop** (`.claude/style-cop.md`, I write it on your OK):
```text
banned: ...
max-comment-ratio: 0.25
no-comments-in: ...
rule: ...
```

**red-green** (paste): `/red-green <command>`
<why this command>
```

On approval, write `.claude/style-cop.md` with the agreed content, then tell the user to run `/style-cop reload` in any open session, and repeat the three paste lines. Change nothing else. If a mod isn't installed, keep its line in the reply with the install command, so the setup is complete the moment they install it.

## Limits

- The fence, the pins, and the test command are set by the user's commands, not by you. Say so; don't report them as done.
- A fence guards Edit, Write, and NotebookEdit, not shell commands; a pin is context, not enforcement; `style-cop` measures comment lines by file extension. Set expectations in the reply when they matter.
- A monorepo or a project with several test suites gets one fence and one test command per project root. Offer the root the user works in and say what's left out.
