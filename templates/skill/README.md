# __NAME__

__DESCRIPTION__

<!-- Two or three sentences a stranger understands: what Claude gets wrong or slow without it, and what the reply looks like with it. -->

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install __NAME__@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./skills/__NAME__
```

## Use it

Type `/__NAME__:__NAME__`, or ask in your own words. Prompts that trigger it:

- "..."
- "..."

<!-- What the reply contains, and where anything it writes goes. -->

## What it touches

From `node scripts/sync-touches.mjs`, read from `SKILL.md` and this folder:

```text
skill: __NAME__
invoked by: user and Claude
tools: none granted
runs in: the main session
hooks: none
reads: nothing beside SKILL.md
bundled: none
shell at load: none
```

A skill is text Claude reads when it is invoked. It grants no permissions of its own: every tool call still goes through your permission prompts and hooks. Loading it adds about N tokens to every session and about N more when it runs, as `claude --plugin-dir ./skills/__NAME__ plugin details __NAME__` estimates; those figures change between Claude Code releases and are not checked by CI.

<!-- If the skill tells Claude to run commands, write files, or fetch anything, say which and why here. -->

## Tested with

- Claude Code `X.Y.Z` in the terminal. `claude plugin eval ./skills/__NAME__`: N of N cases pass, with the skill invoked on every should-trigger run and never on the must-not-trigger run.

## Limitations

<!-- What it cannot judge, where it defers to you, and what it says when it cannot help. -->

## License

MIT, see the repository root.
