# skill-diet

Slim a skill that loads too much: a short SKILL.md that routes to reference files by topic, duplicates removed, every rule kept, and the token cost before and after.

A skill's description sits in every session, and its `SKILL.md`, plus anything it tells Claude to read, loads each time it runs. The largest skill collections ship skills that load the lot on every task: users report slower sessions after installing them, one skill loading about 320k tokens, another linking a 2,975-line guide from its `SKILL.md`. `/skill-doctor` tells you what each skill costs; this skill fixes the one you choose. It is the skill-side twin of [`mcp-diet`](../../mods/mcp-diet/).

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install skill-diet@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./skills/skill-diet
```

## Use it

Type `/skill-diet:skill-diet`, or ask in your own words. Prompts that trigger it:

- "The react-rules skill makes every session slow. Slim it down without losing any rules."
- "This SKILL.md is 900 lines. Split it into reference files."
- "My skill's description gets cut off in the listing. Fix it."

It measures the skill (from `claude plugin details` when the skill is in a plugin, otherwise characters divided by four, and it says which), lists every rule or section as an inventory, and proposes a new layout: a short `SKILL.md` with a routing table, reference files by topic, duplicates and monolith links removed, and a description that leads with its trigger. After you approve, it moves the text unchanged, checks that every inventory item is still reachable, and reports the cost before and after.

It changes structure, never meaning: no rule is reworded, merged, or dropped, and the skill's name and frontmatter fields stay. For a skill inside an installed plugin, which an update would overwrite, it works on a copy and hands you a patch for the upstream repository.

## What it touches

From `node scripts/sync-touches.mjs`, read from `SKILL.md` and this folder:

```text
skill: skill-diet
invoked by: user and Claude
tools: none granted
runs in: the main session
hooks: none
reads: references/diet.md
bundled: none
shell at load: none
```

A skill is text Claude reads when it is invoked. It grants no permissions of its own: every file it writes, and `claude plugin details` if it runs it, goes through your permission prompts. `references/diet.md` holds the bloat patterns, their fixes, and the loading limits from the Claude Code docs. Loading the skill adds about 140 tokens to every session and about 1,700 more when it runs, as `claude --plugin-dir ./skills/skill-diet plugin details skill-diet` estimates; those figures change between Claude Code releases and are not checked by CI.

## Tested with

- Claude Code 2.1.308 in the terminal, with `claude plugin eval ./skills/skill-diet --scaffold --allow-tools Write Edit --judge-model sonnet`. The should-trigger case writes a bloated skill modelled on the issues above: a 441-line `SKILL.md` with 24 rules and a buried trigger, which tells Claude to read a 580-line `AGENTS.md` repeating every rule; the user asks to slim it and approves up front. Each run is graded on four checks: the monolith link is gone, new reference files exist, and a Sonnet judge reads the reply for before-and-after sizes, the new layout, and a coverage check finding all 24 rules with none trimmed.
  - Without the skill: average 0.33 over 3 runs. Every run removed the monolith link, but none created reference files, and every run failed the judge. All three deleted the 48 bad and good examples because the fixture's examples are identical stubs; with real examples that would be lost content, which is the failure the skill exists to prevent.
  - With the skill: average 0.92 over 3 runs, after tightening it so a sentence inside a rule is never cut. Every run removed the monolith link, split the rules into topic files, and reported about 70 to 85% less loaded per task. Two runs passed every check; the third preserved every rule word for word, but two of three judges failed it for listing the removal of a `Topic:` line that was an exact duplicate.
  - The skill fired on every should-trigger run and on none of the 6 must-not-trigger runs.

## Limitations

- It restructures one skill at a time. To find which skill to slim, run `/skill-doctor` first.
- Token figures are estimates. It compares before and after with the same method so the difference is meaningful even when the absolute numbers aren't exact.
- It can't judge whether a rule is obsolete or two rules conflict; it keeps both and tells you.
- A skill whose body is one long procedure with no separable topics has little to gain; it says so instead of splitting for its own sake.

## License

MIT, see the repository root.
