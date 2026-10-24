# Bloat patterns and their fixes

What makes a skill load more than a task needs, how to spot it, and what to do instead. The limits come from the Claude Code skills documentation.

## How a skill is loaded

- **Listing, every session.** Each skill's `name` and its `description` plus `when_to_use` go into a listing Claude reads to decide what to invoke. The combined description text is cut at 1,536 characters. The whole listing has a budget of about 1% of the context window; when it overflows, Claude Code drops descriptions, least-used skills first, which removes the words Claude needs to match a request.
- **Body, on invoke.** `SKILL.md` loads in full when the skill runs and is not re-read on later turns. After compaction, only the start of an invoked skill may be kept, so the most important instructions belong near the top.
- **Supporting files, on demand.** Files beside `SKILL.md` load only when Claude reads them, which it does when `SKILL.md` tells it to. This is progressive disclosure: the body routes, the files hold the detail.
- **Guidance.** Keep `SKILL.md` under 500 lines and move detail into supporting files referenced from it.

## Patterns

### The monolith link

**Spot it.** `SKILL.md` says "for the complete guide read X" or "see X for all rules", and X is hundreds of lines covering every topic.

**Fix.** Split X by topic into reference files, link each from a routing table with the condition for reading it, and delete X once every part has a home. If X must stay for other tools, stop linking it from `SKILL.md`.

### Duplicated rules

**Spot it.** The same rule appears inline in `SKILL.md` and again in a reference file or monolith; or a `CLAUDE.md`, `AGENTS.md`, or symlink in the skill's folder repeats it. A `CLAUDE.md` inside a project's tree can also be picked up as memory and load into every session.

**Fix.** Keep one copy, in the file the routing table points to for that topic. Remove `CLAUDE.md` or symlinks from a skill folder; a plugin's root `CLAUDE.md` isn't loaded at all.

### Everything in the body

**Spot it.** `SKILL.md` runs past a few hundred lines and covers topics a single task doesn't need together (rendering and data fetching and bundling, say).

**Fix.** Keep in `SKILL.md` only what every task needs: when to use, the core procedure, the handful of rules that apply everywhere. Move each topic's rules, examples, and edge cases to `references/<topic>.md`. Route with a table:

```markdown
| Task involves | Read |
| :-- | :-- |
| Rendering, memoization, lists | references/rendering.md |
| Fetching, caching, loading states | references/data.md |
```

Word each link as a condition ("Read references/data.md when the task fetches or caches data"), not as an invitation to read everything.

### The buried trigger

**Spot it.** The description opens with history, praise, or a summary of contents, and the words a user would type come last, or the text exceeds the cap.

**Fix.** First sentence: what the skill does. Second: "Use when ..." with the trigger phrases. Cut adjectives and contents lists. Keep every trigger keyword the old description had unless it is clearly wrong.

### Re-derived procedures

**Spot it.** The body walks Claude through a deterministic multi-step transformation (parse this format, compute that table) that it re-derives every run.

**Fix.** Offer to bundle a script under `scripts/` that the body tells Claude to run. Only propose this; adding executable code changes what the skill does and needs the user's decision.

### Deep nesting

**Spot it.** Reference files link further reference files, three or four levels down.

**Fix.** Keep references one level deep from `SKILL.md`, so Claude can see every route from the body.

## Don't

- Don't paraphrase rules while moving them. Move the exact text; a reworded rule is a changed rule.
- Don't trim sentences out of a rule, even ones that restate its heading or look like filler. Deduplicate only whole blocks that repeat word for word, and keep one copy.
- Don't drop examples to save tokens. Move them with their rule.
- Don't change `name`, `allowed-tools`, `context`, `agent`, `hooks`, or `disable-model-invocation` as part of a diet.
- Don't put the routing table at the bottom. It belongs right after "when to use", where it survives compaction.
