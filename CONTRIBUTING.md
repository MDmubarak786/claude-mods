# Contributing

Thanks for building a mod. This page is the whole process, start to finish.

## Before you start

- Install Claude Code v2.1.287 or later and run `claude --version`.
- Read the [mods overview](https://code.claude.com/docs/en/plugins/mods/overview) once. The [reference](https://code.claude.com/docs/en/plugins/mods/reference) lists every event and `$` method.
- Check the [roadmap](docs/roadmap.md), the [ecosystem survey](docs/ecosystem.md), and open issues so you don't build what exists or what someone else is building. If your idea isn't listed, open a **Mod idea** issue first for a quick sanity check. It saves you from building something we can't merge.

## Scaffold

```bash
scripts/new-mod.sh my-mod "One sentence saying what it does"
```

This copies [`templates/mod`](templates/mod/) to `mods/my-mod`, fills in the name, description, and your git author name, adds the entry to `.claude-plugin/marketplace.json`, regenerates the README table, and runs `claude plugin validate`.

Naming rules, enforced by the script and by `claude plugin validate --strict`:

- Lowercase letters, digits, and hyphens, starting with a letter. Up to 64 characters.
- Must not contain `claude` or `anthropic` anywhere. Claude Code reserves those for Anthropic's own plugins, and `--strict` fails on them.
- Must not collide with a built-in `/command`. Type `/` in a session to see them.

## Develop

Load the mod for one session and edit while it runs. Claude Code reloads the hooks module every time you save:

```bash
scripts/try.sh my-mod
```

While a session is open, Claude Code writes type declarations for your exact version into `mods/my-mod/.claude-plugin/types/`. They're gitignored. Point your editor at them for autocomplete, and trust them over any doc page.

You can also ask Claude to write or change the mod. Start the session with `scripts/try.sh my-mod`, then describe the change. Claude uses its built-in `plugin-authoring` skill and the edits load at the end of the turn.

Rules the static analyzer needs, from the [create page](https://code.claude.com/docs/en/plugins/mods/create#check-what-claude-code-reads-from-your-mod):

- Write every API call in full: `$.store.get(...)`, never `const store = $.store`.
- Write event names as string literals in `on(...)`.
- Import only from files inside the mod, with `import` declarations. The one bare import allowed is `claude-code`.
- Give any hook that can refuse something (`tool.call`, `prompt.submit`, `tool.check`) a `.catch` handler that fails closed.
- Register commands last in `session.start`, or wrap `$.command.register` in `try`/`catch`. A thrown registration skips the rest of the hook.

## Test

Every mod ships tests. They run with no session, no sign-in, and no network:

```bash
cd mods/my-mod && claude plugin test
```

Put tests in `tests/*.test.ts`. The [test page](https://code.claude.com/docs/en/plugins/mods/test) shows how to stub the store, a model call, a timer, and how to press buttons in a pane. At minimum, test the event your mod exists for: the deny, the rewrite, or the command's reply.

Run everything CI runs before you open a pull request:

```bash
scripts/validate.sh
```

## Write the README

Fill in every section of the generated `mods/my-mod/README.md`. Reviewers check for:

- **What it does** in two or three sentences a stranger understands.
- **A screenshot or recording** if the mod draws anything. Put it in `mods/my-mod/screenshots/`.
- **Hooks and calls**: the fenced block under **What it touches** must be exactly the `hooks:` and `calls:` lines `claude plugin validate ./mods/my-mod` prints. `node scripts/sync-touches.mjs` pastes them for you, and CI fails if they drift. This is how users decide whether to trust the mod.
- **Tested with**: the exact `claude --version` you tested on, and the surface (terminal, Desktop app, or both). Events change between releases.
- **Limitations**: what it can't catch or doesn't handle. Honest limitations are what make a safety mod trustworthy.

## Branches

`main` is protected. Nobody pushes to it directly, maintainers included; every change lands through a pull request. Work on a branch named for what it changes:

| Branch | For |
| :-- | :-- |
| `mod/<name>` | A new mod |
| `fix/<name>-<topic>` | A bug fix in one mod |
| `feat/<name>-<topic>` | An improvement to one mod |
| `docs/<topic>` | Documentation and templates only |
| `ci/<topic>` | Workflows and scripts |
| `chore/<topic>` | Repository housekeeping |

Fork the repository if you don't have write access, and branch in your fork. Keep a branch to one mod; two mods means two branches and two pull requests.

## Commit messages and pull request titles

Pull requests are squash-merged, so the title becomes the one commit on `main`. Write it as:

| Change | Title |
| :-- | :-- |
| A new mod | `Add <name>: <what it does>` |
| A change to one mod | `<name> <new version>: <what changed>` |
| Anything else | `docs: ...`, `ci: ...`, or `chore: ...` |

Commits on your branch can say whatever helps you; they're folded into one.

## Open the pull request

- One mod per pull request.
- A change to an existing mod bumps `version` in its `plugin.json`. Claude Code only delivers a plugin to installed users when the version string changes, so an unbumped change never reaches anyone. CI checks this.
- Don't set `version` in the marketplace entry. `plugin.json` is the single source of truth.
- Fill in the pull request template. It's mostly checkboxes.
- Open it as a draft while you're still working, and mark it ready when `scripts/validate.sh` passes.

## What has to pass before merge

Branch protection on `main` requires all of these:

- **The `validate` check passes** on the latest commit, and the branch is up to date with `main`. It runs strict validation on the catalog and every mod, every mod's tests, the README table and issue-form lists, the touches blocks, and the version-bump check.
- **One approving review from a code owner.** `.github/CODEOWNERS` names who that is for each directory. A new commit after the review dismisses it.
- **Every review conversation is resolved.**
- **Linear history.** Squash merge is the only merge button; the branch is deleted after merge.

A maintainer reviews against the [review checklist](docs/review-checklist.md). Expect questions about anything the mod reads, writes, runs, or sends.

**Maintainers** can land a mod with `scripts/ship.sh <name> "<title>" --pr`, which commits one mod on its own branch with only its own catalog row and opens the pull request. [docs/maintaining.md](docs/maintaining.md) covers merging, labels, releases, and the repository settings.

## After it's merged

You're added to `.github/CODEOWNERS` for your mod's directory, so you're requested on any pull request that touches it. If you can no longer maintain it, open an issue and we'll find someone or retire it with a `renames` entry so existing installs don't break.
