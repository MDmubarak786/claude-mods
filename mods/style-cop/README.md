# style-cop

Enforce the style rules Claude keeps ignoring. Two of the most-reacted model-behaviour issues on the Claude Code tracker are verbose code comments that survive every instruction to stop, and the word "load-bearing" in every other reply. A rule in CLAUDE.md is a request; this mod makes the measurable ones a refusal.

Rules are shown to Claude on every prompt, and the measurable ones are enforced on Edit, Write, and MultiEdit: an edit that adds a banned phrase, too many comment lines, or a comment to a file that must stay comment-free is refused with the exact line or count, and Claude rewrites it.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install style-cop@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/style-cop
```

## Use it

Create `.claude/style-cop.md` in your project, one rule per line:

```text
banned: load-bearing, delve, "as an AI"
max-comment-ratio: 0.25
no-comments-in: *.json, migrations/**
rule: Prefer early returns over nested conditionals.
```

| Rule | Enforced on edits | Shown to Claude |
| :-- | :-- | :-- |
| `banned:` words or phrases, comma-separated, quotes optional | Yes: any added line containing one, whole-word, case-insensitive | Yes |
| `max-comment-ratio:` a fraction | Yes: when an edit adds 5 or more non-blank lines and more than that share are comments, by the file's language | Yes |
| `no-comments-in:` globs | Yes: any comment line added to a matching file | Yes |
| `rule:` free text | No | Yes |

What Claude reads when an edit is refused:

```text
style-cop: this edit was refused because of 4 comment lines out of 7 added (57%, the limit is 25%). Rewrite it without the violation and try again. The project style rules are in your context.
```

| Command | What it does |
| :-- | :-- |
| `/style-cop` | Show the active rules, where they came from, and the refusal count. |
| `/style-cop reload` | Re-read the rules file after editing it. |
| `/style-cop ban <phrase>` | Ban a phrase in every project. Saved across sessions. |
| `/style-cop unban <phrase>` | Remove a global ban. |

## What it touches

From `claude plugin validate ./mods/style-cop`:

```text
hooks: session.start, command.run{command=style-cop}, prompt.submit, tool.call{tool=Edit|Write|MultiEdit}
calls: $.command.register, $.fs.exists (via loadRules), $.fs.read (via loadRules), $.session.root (via loadRules), $.store.get (via loadRules), $.store.set, $.ui.log
```

- **`prompt.submit`** adds the rules as context after your prompt. Your message in the transcript is unchanged. The text is stable between prompts, so it doesn't disturb the prompt cache.
- **`$.fs.read`** reads only `.claude/style-cop.md` under the project root.
- **`$.store`** holds the global bans.

**Failure policy.** This is a guard, so if the check throws or times out the edit is refused rather than let through.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass. `/style-cop` answered from a live `claude -p` session.

## Limitations

- Comment detection is line-based by file extension: a line that starts with `//`, `#`, `--`, `<!--`, or a block-comment marker. Trailing comments on code lines don't count, and languages not in the list aren't measured.
- Only what an edit adds is checked. Existing comments in a file aren't counted against it.
- Banned phrases are matched in everything an edit adds, including prose files, on purpose.
- A rule written in `rule:` is advice to Claude, not a check.

## License

MIT, see the repository root.
