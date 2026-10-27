# trigger-test

Find out whether a skill fires when it should and stays quiet when it shouldn't: eval cases in a user's words, run with claude plugin eval, and description edits until both pass.

A skill helps only if Claude invokes it, and Claude decides from one line: the skill's description in the listing. When it never fires, the usual advice is to reword the description and try a few prompts by hand. The script the `skill-creator` plugin ships for measuring this was reported scoring 0% on 144 queries, including an explicit request to run the skill. Claude Code's own `claude plugin eval` does work. This skill writes cases for it in a user's words, runs them, and edits the description until the skill fires on the right requests and nowhere else. This repository's skills are tested the same way.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install trigger-test@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./skills/trigger-test
```

## Use it

Type `/trigger-test:trigger-test`, or ask in your own words. Prompts that trigger it:

- "My csv-tidy skill never kicks in when I ask Claude to clean a CSV. Work out why."
- "Write trigger tests for the skill in skills/deploy-notes."
- "This skill fires on everything. Tighten its description."

It first rules out causes no description fixes (`disable-model-invocation`, a `paths` filter, frontmatter that doesn't parse). Then it writes three to five should-trigger cases in varied wording, two or three must-not-trigger cases drawn from neighbouring tasks, and one held-out case it won't tune against. Each case has a `tool_used` grader on the `Skill` tool. It runs them with `claude plugin eval --ablation none` after telling you the rough cost, works out why each miss happened, proposes a new description with the old one beside it, and re-runs until every should-trigger case fires in at least two of three runs and no must-not-trigger case fires, or three rounds pass. If it can't run commands, it gives you the command.

It changes only the `description` (and `when_to_use`), never the skill's body, name, or other fields.

## What it touches

From `node scripts/sync-touches.mjs`, read from `SKILL.md` and this folder:

```text
skill: trigger-test
invoked by: user and Claude
tools: none granted
runs in: the main session
hooks: none
reads: references/evals.md
bundled: none
shell at load: none
```

A skill is text Claude reads when it is invoked. It grants no permissions of its own: the eval files it writes, the description edit, and `claude plugin eval` all go through your permission prompts, and each eval run is a model call on your account. `references/evals.md` holds the case and grader formats, the commands, and the rules for writing a description that triggers. Loading the skill adds about 150 tokens to every session and about 1,600 more when it runs, as `claude --plugin-dir ./skills/trigger-test plugin details trigger-test` estimates; those figures change between Claude Code releases and are not checked by CI.

## Tested with

- Claude Code 2.1.308 in the terminal, with `claude plugin eval ./skills/trigger-test --scaffold --allow-tools Write Edit --judge-model sonnet`. The should-trigger case writes a `csv-tidy` skill whose description opens with history and never says CSV, clean, duplicates, or dates, while its body says exactly what it does. The user asks why it never fires, approves edits, and says not to run anything. Graders: the description now mentions CSV, eval case files exist under the skill, and a Sonnet judge reads the reply for the cause, the new description, should- and must-not-trigger cases, and the `claude plugin eval` command.
  - With the skill: 1.00, all 3 runs passing every check.
  - Without the skill: 0.33. Every run fixed the description correctly, but none wrote `claude plugin eval` cases; each built its own Python harness around `claude -p` instead, the same approach as the `skill-creator` script reported scoring 0%.
  - The skill fired on every should-trigger run and on none of the 6 must-not-trigger runs. About $1.80. The run doesn't exercise the skill's own eval loop, since the eval can't run `claude` inside itself; that loop follows the steps this repository used to test its five skills.

## Limitations

- It tests whether the skill is invoked, not whether it then does the job well.
- Results vary between runs and models; three runs per case is a floor, and before-and-after comparisons should pin `--model`.
- The eval loads only the plugin under test. In a real session with many skills installed, the listing budget can still drop this skill's description; `/skill-doctor` shows which skills crowd it.
- Evals cost model calls. It states the rough cost before running and stops at three rounds.

## License

MIT, see the repository root.
