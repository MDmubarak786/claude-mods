# Review checklist

What a maintainer checks before merging a mod. Contributors: run through it yourself first.

## Run it

- [ ] `claude plugin validate --strict ./mods/<name>` passes.
- [ ] `claude plugin test` passes from the mod's directory, and the tests exercise the event the mod exists for.
- [ ] `claude --plugin-dir ./mods/<name>` loads it, and `/plugin` lists it on the mods line.
- [ ] If it draws, it looks right in a 100-column terminal and in the Desktop app, or the README says which surface it supports.

## Compare the code with its claims

- [ ] The `hooks:` and `calls:` lines from `validate` match the README's **What it touches** section exactly.
- [ ] Every `env.get`, `env.set`, `http.fetch`, `process.run`, `process.spawn`, `prompt.submit`, `tool.check`, `settings.read`, and `session.send` call is explained in the README and is necessary for the mod's stated purpose.
- [ ] No `telemetry.*` hooks. No hooks on `*` unless the mod is a logger and says so.
- [ ] No `$.prompt.submit({ asUser: true })`.
- [ ] No imports from outside the mod's directory. No `eval`, `new Function`, or code built from fetched text.

## Safety of the hooks themselves

- [ ] Every gating hook (`tool.call`, `tool.check`, `prompt.submit`, `config.set`) has a `.catch` that fails closed. `validate` prints `gating hook without .catch` when one is missing.
- [ ] Any wait on the user goes through `$.ui.ask` or a `$` call, not a bare promise, so it doesn't eat the hook's 10-second budget and get skipped.
- [ ] A `tool.call` hook that answers with `{ result }` never does so for a call it didn't originate, unless the README says the mod replaces that tool.
- [ ] `session.start` registers commands last or inside `try`/`catch`.
- [ ] Timers started with `$.clock.every` do bounded work and don't start turns unexpectedly.

## Repository hygiene

- [ ] `plugin.json` has `name`, `version`, `description`, `author`, `license`. The name contains no `claude` or `anthropic`.
- [ ] Existing mod: `version` is bumped. `version` is not set in the marketplace entry.
- [ ] `.gitignore` excludes `.claude-plugin/types/`. No `CLAUDE.md` inside the mod.
- [ ] README has **Tested with** naming a Claude Code version, and an honest **Limitations** section.
- [ ] Screenshots are present if the mod draws anything.
- [ ] `.github/CODEOWNERS` has a line for the mod.
