# Contributing

Thanks for building a mod. This page is the whole process, start to finish.

## Before you start

- Install Claude Code v2.1.287 or later and run `claude --version`.
- Read the [mods overview](https://code.claude.com/docs/en/plugins/mods/overview) once. The [reference](https://code.claude.com/docs/en/plugins/mods/reference) lists every event and `$` method.
- Check the [roadmap](docs/roadmap.md) and open issues so two people don't build the same thing. If your idea isn't listed, open a **Mod idea** issue first for a quick sanity check. It saves you from building something we can't merge.

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

Run everything CI runs before you push:

```bash
scripts/validate.sh
```

## Write the README

Fill in every section of the generated `mods/my-mod/README.md`. Reviewers check for:

- **What it does** in two or three sentences a stranger understands.
- **A screenshot or recording** if the mod draws anything. Put it in `mods/my-mod/screenshots/`.
- **Hooks and calls**: paste the `hooks:` and `calls:` lines from `claude plugin validate ./mods/my-mod`. This is how users decide whether to trust the mod.
- **Tested with**: the exact `claude --version` you tested on, and the surface (terminal, Desktop app, or both). Events change between releases.
- **Limitations**: what it can't catch or doesn't handle. Honest limitations are what make a safety mod trustworthy.

## Open the pull request

- One mod per pull request.
- A change to an existing mod bumps `version` in its `plugin.json`. Claude Code only delivers a plugin to installed users when the version string changes, so an unbumped change never reaches anyone. CI checks this.
- Don't set `version` in the marketplace entry. `plugin.json` is the single source of truth.
- Fill in the pull request template. It's short.

A maintainer reviews against the [review checklist](docs/review-checklist.md). Expect questions about anything the mod reads, writes, runs, or sends.

## After it's merged

You're added to `.github/CODEOWNERS` for your mod's directory, so you're requested on any pull request that touches it. If you can no longer maintain it, open an issue and we'll find someone or retire it with a `renames` entry so existing installs don't break.
