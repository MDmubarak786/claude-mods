# Trigger eval files, commands, and description rules

From the Claude Code plugin eval and skills documentation. `claude plugin eval --help` is the final word on flags for the installed version.

## Layout

```text
<plugin or skill folder>/
├── .claude-plugin/plugin.json      (absent for a standalone skill folder)
├── skills/<skill>/SKILL.md         (or SKILL.md at the root of a skill folder)
└── evals/
    ├── fires-on-terse-request/
    │   ├── prompt.md
    │   └── graders/skill-fired.md
    ├── quiet-on-neighbour/
    │   ├── prompt.md
    │   └── graders/not-fired.md
    └── results/                    written by each run; add evals/results/ to .gitignore
```

A folder is a case when it holds `prompt.md` or `case.yaml`; every case needs at least one grader. Name each case after what it checks.

## prompt.md

```markdown
---
description: What this case checks, for humans.
max_turns: 3
allowed_tools: [Read, Glob, Grep, Skill]
---

The request, exactly as a user would type it. Never name the skill.
```

Other fields: `runs` (default 3), `model`, `timeout_seconds` (default 300), `tags`, `plugins` (set `plugins: ["../.."]` if the plugin isn't found from the case folder). An unknown key is an error. Each run starts in an empty folder, so put any context the request needs in the prompt itself.

## Graders

Should trigger, `graders/skill-fired.md`:

```markdown
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?<skill-name>"'
---
```

Must not trigger, `graders/not-fired.md`:

```markdown
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?<skill-name>"'
min: 0
max: 0
arm: both
---
```

The `(?:[\w-]+:)?` part matches the plugin-namespaced form `/plugin:skill`. `arm: both` keeps the negative check scored if a baseline arm runs. Other grader types (`regex`, `file_exists`, `llm`) judge what the skill produced, which is beyond a trigger test.

## Commands

```bash
claude plugin eval <target> --ablation none --runs 3             all cases, no baseline
claude plugin eval <target> --ablation none --case 'fires-*'     a subset by name glob
claude plugin eval <target> --ablation none --model sonnet       pin the model for before/after
```

- `<target>` is the plugin folder, a standalone skill folder, or an installed `name@marketplace`.
- Every run is a real model call on the user's account. A trigger case with `max_turns: 3` costs a few cents per run; the command prints the total. `--max-cost-usd <n>` caps it.
- The first run in a folder asks to trust it; `--trust-plugin` answers yes, for CI.
- If the case grants a shell tool and the machine can't sandbox one, the run is refused. Trigger cases need no shell.
- Results: a table on stdout, and `aggregate-result.json` plus `report.html` under `evals/results/<timestamp>/`. In the JSON, each case lists its runs under `arms`, and each run's graders with `passed` and an `explanation` such as `Skill called 0x (expected 1..∞)`.

If every case, including an explicit request, shows `Skill called 0x`, the plugin probably didn't load: check the target path, and set `plugins` in `prompt.md`.

## How Claude picks a skill

- Claude sees a listing of every skill's `name` plus `description` (and `when_to_use`, appended). Full text loads only when the skill is invoked.
- The combined description text is cut at 1,536 characters. The whole listing has a budget of about 1% of the context window; when it overflows, descriptions of the least-used skills are dropped first, leaving only the name.
- `disable-model-invocation: true` removes the skill from Claude's choice entirely. `paths:` limits automatic loading to matching files.

## Writing a description that triggers

- **First sentence: what it does**, in plain words. Second: "Use when ..." followed by the requests and symptoms people actually type.
- **Use the user's vocabulary**: file types (CSV, PDF), verbs (clean, fix, slim, review), symptoms ("never fires", "too slow", "stuck on an old version"). Include common synonyms.
- **Key use case first.** Anything after the cut, or after a long preamble, may as well not exist.
- **Name the boundary** when a neighbour is close: "for X, not Y" keeps it quiet on Y.
- **No marketing, history, or contents lists.** "Maintained since 2019" and "covers several passes" match nothing a user says.
- **Avoid words that match everything** on their own ("help", "code", "files", "data").
