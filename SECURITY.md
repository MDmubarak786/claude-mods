# Security policy

Mods run inside Claude Code's process with the user's permissions. Nothing in this repository changes that, so the policy below is what makes installing from `modhub` safer than installing from an unknown source.

## Report a problem

If a mod in this repository does something it shouldn't, open a [security advisory](https://github.com/MDmubarak786/claude-mods/security/advisories/new) rather than a public issue. Include the mod name, the version from its `plugin.json`, and what you observed. We aim to respond within three days and to pull or patch an affected mod before discussing details publicly.

## What a merged mod must not do

A mod is refused, or removed, if it:

- **Approves tool calls** by returning `allow` from `tool.check` or by answering `tool.call` for a call it didn't originate, unless the mod's entire purpose is a documented policy guard and the README says so.
- **Reads secrets** through `$.env.get` or `$.settings.read` for anything beyond its own documented `userConfig` option.
- **Sends data off the machine** with `$.http.fetch` or `$.process.run` unless the call is the mod's stated purpose or sits behind a setting, the README names the endpoint, and the data sent is listed. `pkg-guard` looking up a package name on its registry is the model case.
- **Submits prompts** with `$.prompt.submit({ asUser: true })`. A mod may start a turn in its own name; it may not speak as the user.
- **Rewrites what the user typed** in `prompt.submit` beyond what the README describes.
- **Runs code it fetched at runtime**, or imports anything outside its own directory.
- **Hides what it does**: obfuscated source, a `calls:` line that doesn't match the README, or hooks on `telemetry.*` events.

## What a merged skill must not do

A skill is a page of instructions Claude reads when a task matches it. It runs no code of its own and grants no permissions, but it steers what Claude asks to do. A skill is refused, or removed, if it:

- **Tells Claude to fetch and run code**, such as `curl | sh`, a download it then executes, or a script fetched at run time. A script a skill needs ships inside its folder and is listed on the README's `bundled:` line.
- **Sends data off the machine** by instructing Claude to post files, logs, or secrets anywhere, unless that is the skill's stated purpose, the README names the endpoint, and the data sent is listed.
- **Works around permissions or hooks**: text that tells Claude to skip a confirmation, ignore a refusal, disable a hook, or treat the user's instructions, `CLAUDE.md`, or another skill as lower priority than itself.
- **Speaks as the user** or claims an authorization the user didn't give.
- **Hides what it does**: instructions in HTML comments, zero-width or bidirectional characters, encoded text, or a `description` that says one thing while the body does another.
- **Grants more than it needs** in `allowed-tools`, or runs shell at load (`` !`cmd` ``) without a README sentence saying what the command reads.

## How reviewers check

Every pull request is reviewed against [docs/review-checklist.md](docs/review-checklist.md). For a mod, the reviewer runs `claude plugin validate --strict` and compares its `hooks:`, `calls:`, `env reads:`, and `env writes:` lines against the README and the code. For a skill, the reviewer reads `SKILL.md` and every file beside it, and compares the README's **What it touches** block, generated from the frontmatter and folder, against what the text asks Claude to do. CI runs the same validation, every mod's tests, and every skill's structure and load checks.

## How you can check

Before you install any mod, from any marketplace:

```bash
claude plugin validate ./path/to/mod
```

Read the `hooks:` and `calls:` lines. If you see `env.get`, `http.fetch`, `process.run`, `prompt.submit`, or `tool.check` and the README doesn't explain why, don't install it.

For a skill, read its `SKILL.md`: it is short by rule, and everything it will make Claude do is in it. If it tells Claude to download anything, run a command the README doesn't name, or ignore your instructions, don't install it.
