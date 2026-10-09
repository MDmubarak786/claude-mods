# Security policy

Mods run inside Claude Code's process with the user's permissions. Nothing in this repository changes that, so the policy below is what makes installing from `modhub` safer than installing from an unknown source.

## Report a problem

If a mod in this repository does something it shouldn't, open a [security advisory](https://github.com/OWNER/claude-mods/security/advisories/new) rather than a public issue. Include the mod name, the version from its `plugin.json`, and what you observed. We aim to respond within three days and to pull or patch an affected mod before discussing details publicly.

## What a merged mod must not do

A mod is refused, or removed, if it:

- **Approves tool calls** by returning `allow` from `tool.check` or by answering `tool.call` for a call it didn't originate, unless the mod's entire purpose is a documented policy guard and the README says so.
- **Reads secrets** through `$.env.get` or `$.settings.read` for anything beyond its own documented `userConfig` option.
- **Sends data off the machine** with `$.http.fetch` or `$.process.run` unless the README names the endpoint, the user opted in through `userConfig`, and the data sent is listed.
- **Submits prompts** with `$.prompt.submit({ asUser: true })`. A mod may start a turn in its own name; it may not speak as the user.
- **Rewrites what the user typed** in `prompt.submit` beyond what the README describes.
- **Runs code it fetched at runtime**, or imports anything outside its own directory.
- **Hides what it does**: obfuscated source, a `calls:` line that doesn't match the README, or hooks on `telemetry.*` events.

## How reviewers check

Every pull request is reviewed against [docs/review-checklist.md](docs/review-checklist.md). The reviewer runs `claude plugin validate --strict` and compares its `hooks:`, `calls:`, `env reads:`, and `env writes:` lines against the README and the code. CI runs the same validation and the mod's tests.

## How you can check

Before you install any mod, from any marketplace:

```bash
claude plugin validate ./path/to/mod
```

Read the `hooks:` and `calls:` lines. If you see `env.get`, `http.fetch`, `process.run`, `prompt.submit`, or `tool.check` and the README doesn't explain why, don't install it.
