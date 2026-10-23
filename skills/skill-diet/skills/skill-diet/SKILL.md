---
name: skill-diet
description: Slim a Claude Code skill that loads too much context, without losing any of its rules. Use when a skill makes sessions slow or expensive, its SKILL.md is long, it links a huge guide or monolith file, its description is cut off in the skill listing, or the user asks to shrink, trim, split, or restructure a skill for progressive disclosure. Measures the token cost before and after.
---

# skill-diet

A skill costs context twice: its name and description sit in every session's skill listing, and its `SKILL.md`, plus anything it tells Claude to read, loads each time it runs. A bloated skill pays both on every task, even when the task needs one section. This skill restructures one skill so it loads only what a task needs, keeps every rule it had, and shows the cost before and after.

You change structure, never meaning. Every rule, step, example, and frontmatter field the skill had must still be reachable afterwards, and you prove it with a coverage check. Within a rule, every sentence moves word for word, including one that seems to repeat the heading: trimming a rule is rewording it.

## 1. Find the skill and measure it

Accept a path to a skill folder (one holding `SKILL.md`), a plugin folder, or a skill name, and find its `SKILL.md`. Say where it lives, because that decides where your changes can go:

| Location | Edit in place? |
| :-- | :-- |
| The user's project or `~/.claude/skills/` | Yes |
| A plugin the user is developing (a folder with `.claude-plugin/plugin.json`) | Yes; remind them to bump `version` |
| An installed plugin under `~/.claude/plugins/` | No: an update overwrites it. Work on a copy and hand back a patch for the upstream repository |

Measure two numbers, and keep the method so the after-measurement is the same:

- **Always-on**: the `name`, `description`, and `when_to_use` in the frontmatter, which load in every session.
- **On invoke**: `SKILL.md` plus every file it tells Claude to read for a typical task.

When the skill is inside a plugin and you can run commands, `claude --plugin-dir <plugin folder> plugin details <plugin name>` prints both. Otherwise estimate tokens as characters divided by four, and say it is an estimate. Note lines too: the guidance is to keep `SKILL.md` under 500 lines.

## 2. Diagnose

Read `SKILL.md` and every file beside it in full. Open [references/diet.md](references/diet.md) and check the skill against each bloat pattern there. The usual culprits:

- A link that sends Claude to a whole manual ("for the complete guide, read AGENTS.md") so every run loads everything.
- The same rules written twice: inline in `SKILL.md` and again in a reference file or a monolith.
- One long `SKILL.md` covering many topics a single task never needs together.
- A description that opens with background and buries the trigger, or runs past the 1,536-character listing cap.
- Procedures Claude re-derives every run that a bundled script could do.

Before changing anything, write an inventory: every rule, step, or section heading, with an ID if it has one. This is the list the coverage check uses.

## 3. Propose the new layout

Reply with a plan the user can approve:

- The new `SKILL.md`: what stays (when to use, the core steps every task needs, the most important rules near the top) and the routing table that says which reference file to read for which kind of task.
- Each reference file: its topic and the inventory items it receives. One level deep, named by topic, linked from `SKILL.md` with the condition for reading it.
- What is deleted and why: only dead links and true duplicates, never a rule or part of one. A true duplicate is a whole block (a rule, a paragraph, a file) that appears word for word somewhere else; keep one copy and make sure every place that relied on it can still reach it. A sentence inside a rule is never a duplicate, even when it echoes the heading or another rule.
- The rewritten description: the main use case first, trigger words kept, under the cap.
- The expected cost after, estimated the same way.

If the user already said to go ahead, continue; otherwise wait for approval.

## 4. Apply, verify, report

Make the changes, then check coverage: every item in the inventory must appear in the new `SKILL.md` or a reference file it links, worded as before. Search for each ID, and for one distinctive phrase from each rule's body as well as its heading; fix any miss before reporting. If you can't delete a file the skill no longer links, say so and leave it for the user. Confirm every relative link resolves and the frontmatter still parses with the same `name` and fields.

Report in this shape:

```markdown
## skill-diet: <skill name>

| | Before | After |
| :-- | :-- | :-- |
| Always-on (description) | ~N tokens | ~N tokens |
| On invoke (SKILL.md + what it loads) | ~N tokens, N lines | ~N tokens, N lines |

**New layout.** SKILL.md, then each reference file and what it holds.
**Removed.** Each duplicate or dead link, and where its content still lives.
**Coverage.** N of N rules found after the change, with any that moved named.
**Next.** Bump the plugin version, reload, and try one task that needs a reference file.
```

## Limits

- Structure only. Don't rewrite rules for style, merge rules that differ, or drop ones that look obsolete; raise those separately.
- Don't rename the skill: its name is how users and other skills invoke it.
- Token figures are estimates either way. Compare before and after with the same method, and say which one you used.
