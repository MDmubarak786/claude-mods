---
name: trigger-test
description: Test whether a Claude Code skill triggers when it should and stays quiet when it shouldn't, then fix its description. Use when a skill never fires, fires on the wrong requests, Claude picks another skill instead, or the user wants trigger tests, eval cases, or a description tuned for a skill. Writes cases for claude plugin eval, runs them, and proposes description edits until both pass.
---

# trigger-test

A skill only helps if Claude invokes it. Claude decides from the skill's `name` and `description` in the listing, so a description that doesn't use the words people type, buries its use case, or reaches too wide makes the skill silent or noisy. This skill measures that with `claude plugin eval` and fixes the description, not by guessing.

Change only the frontmatter `description` (and `when_to_use`, if the skill has one). Never change the skill's body, name, or other fields to make a test pass.

## 1. Find the skill

Accept a skill folder (holding `SKILL.md`), a plugin folder, or a skill name. `claude plugin eval` takes the plugin folder, or the skill folder itself for a standalone skill. Say which you will target. Read the frontmatter and the body: the body is the ground truth for what the skill is for.

Check first for causes no description fixes, and report them instead of writing cases:

- `disable-model-invocation: true` means Claude never invokes it; only `/name` does.
- `user-invocable: false` hides it from the `/` menu but Claude can still invoke it.
- `paths:` limits it to files that match, so prompts about other files never trigger it.
- The description is missing, or the frontmatter doesn't parse (it then loads with no description at all).

## 2. Write the cases

Open [references/evals.md](references/evals.md) for the file formats. Under the eval folder (`evals/` unless the manifest says otherwise), write:

- **Should trigger**, three to five cases: requests the skill exists for, in the words a user would type, never naming the skill. Vary them: a terse one, a long one with context, one that uses a synonym rather than the skill's own vocabulary, one that names a symptom rather than the task.
- **Must not trigger**, two or three cases: nearby requests that belong to another skill, a built-in command, or plain conversation. A case the skill should obviously ignore proves nothing; pick neighbours.
- **Held out**, one more should-trigger case you write now and don't look at while tuning. It tells you whether a description edit generalised or just memorised your cases.

Each case gets a `tool_used` grader on `Skill` whose `input_match` names the skill: at least once for should-trigger, `min: 0` and `max: 0` with `arm: both` for must-not-trigger. Keep `max_turns` low (3 to 5); a trigger happens on the first move or not at all.

## 3. Run

Run from the plugin folder, if you can run commands:

```bash
claude plugin eval <target> --ablation none --runs 3
```

`--ablation none` skips the no-plugin baseline, which a trigger test doesn't need. Each run is a real model call on the user's account: say the rough cost first (cases × runs × a few cents) unless they already agreed. If you can't run commands, give the user this command and stop until they paste the results.

Read the per-case trigger counts from the output, or from `aggregate-result.json` in the results folder it prints.

## 4. Fix the description

For each miss, work out why before editing:

- **Doesn't fire**: the request's words aren't in the description; the use case comes after background or a contents list; the description is cut at 1,536 characters or dropped from a crowded listing; another skill's description matches the request better.
- **Fires wrongly**: the description claims a broader area than the body does, or uses generic words ("files", "code", "help") that match everything.

Then edit, following the rules in the reference: first sentence says what it does, then "Use when ..." with the phrases from the cases that missed, plus words for the symptom. Narrow wording that caused false fires. Show the old and new description side by side and get approval unless the user already gave it.

Re-run all cases, including the held-out one. Stop when every should-trigger case fires in at least two of three runs and no must-not-trigger case fires; or after three rounds, and say what still misses and why.

## 5. Report

```markdown
## trigger-test: <skill>

| Case | Expect | Before | After |
| :-- | :-- | :-- | :-- |
| <case> | fire | 0/3 | 3/3 |
| <case> | quiet | 0/3 | 0/3 |
| <held-out case> | fire | 1/3 | 3/3 |

**Why it missed.** One line per cause.
**Description.** Old, then new.
**Cost.** The total the runs printed.
**Next.** Commit the evals with the skill; re-run them after any description change or Claude Code upgrade.
```

## Limits

- A trigger test shows that Claude invoked the skill, not that the skill then did the job well. Graders for quality are a separate step.
- Results vary between runs and models. Three runs per case is a minimum; pin `--model` when comparing before and after.
- If many skills are installed, the listing budget can drop this skill's description in real sessions even when the eval passes; the eval loads only the plugin under test.
