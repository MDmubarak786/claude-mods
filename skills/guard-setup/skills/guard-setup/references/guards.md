# The four guards: syntax and defaults

Each mod's exact commands and file format, from their READMEs in the modhub marketplace, with the defaults to start a draft from. Install any missing one with `/plugin install <name>@modhub` after `/plugin marketplace add MDmubarak786/claude-mods`.

## fence

Limits which paths Claude may edit, write, or change a notebook in. Refused edits tell Claude why. Saved per project root; survives restarts.

| Command | Does |
| :-- | :-- |
| `/fence src/ tests/ docs/README.md` | Allow edits only under those paths, relative to the project root |
| `/fence` | Show the fence |
| `/fence off` | Remove it |

Drafting: name the folders the user edits on purpose, usually source and tests, and the one or two files they change often (a README, a changelog). Leave out lockfiles, generated output, migrations, CI config, `.env` files, and anything in `.gitignore`. A fence can be widened later; start narrow. It doesn't cover Bash, so say so when the project relies on scripts that write files.

## pins

Instructions Claude reads after every prompt, including after compaction, `/clear`, and restarts. Saved per project root. Up to 25; keep it to the few that matter.

| Command | Does |
| :-- | :-- |
| `/pin run pnpm test before saying done` | Pin one rule |
| `/pin` | List them |
| `/pin rm 2` | Remove pin 2 |
| `/pin clear` | Remove all |

Drafting: one line each, imperative, project-specific. Good pins: the test command to run before claiming done; folders not to touch (`migrations/`, generated code); the package manager to use; the commit title format; "ask before adding a dependency". Bad pins: general style advice (that is `style-cop`), anything already enforced by a fence, and long paragraphs.

## style-cop

Reads `<project>/.claude/style-cop.md`, one rule per line. The measurable rules are enforced on Edit, Write, and MultiEdit; the rest are shown to Claude on every prompt.

```text
banned: load-bearing, delve, "as an AI"
max-comment-ratio: 0.25
no-comments-in: *.json, migrations/**
rule: Prefer early returns over nested conditionals.
```

| Line | Enforced | Meaning |
| :-- | :-- | :-- |
| `banned:` | Yes | Comma-separated words or phrases; any added line containing one, whole-word, case-insensitive, is refused |
| `max-comment-ratio:` | Yes | A fraction; an edit adding 5 or more non-blank lines with more than that share of comment lines is refused |
| `no-comments-in:` | Yes | Globs; any comment line added to a matching file is refused |
| `rule:` | No | Free text shown to Claude |

After writing or changing the file, the user runs `/style-cop reload` in an open session; a new session reads it on start.

Defaults to start from: `banned: load-bearing, delve, "as an AI", seamless, robust` trimmed to what the user dislikes; `max-comment-ratio: 0.25`; `no-comments-in:` for `*.json`, lockfiles, `migrations/**`, generated folders, and snapshot or fixture folders; one `rule:` per style instruction found in `CLAUDE.md` that isn't measurable. Comment detection is by file extension (`//`, `#`, `--`, `<!--`, block markers), so a language it doesn't know isn't measured.

## red-green

Runs the project's tests after any turn in which Claude edited a file, prints pass or fail under the answer, and sends a failure back with `/fix`. The command is saved per project.

| Command | Does |
| :-- | :-- |
| `/red-green pnpm test -- --run` | Set the command, as you would type it at a shell prompt |
| `/red-green detect` | Pick `npm test`, `pnpm test`, or `yarn test` from `package.json`, or `pytest`, `cargo test`, `go test ./...`, or `make test` from the files present |
| `/red-green` | Show the command and the last result |
| `/red-green off`, `/red-green on` | Pause or resume |

Drafting: use what CI runs, with the flags that make it non-interactive and non-watching (`--run` for vitest, `CI=true` for some runners, `-q` where output is long). It runs through `sh -c` in the project root with a 3-minute timeout, so a suite longer than that needs a narrower command. When Claude's turn changed `package.json`, a Makefile, `pyproject.toml`, or the test config, the mod asks before running, and skips under `claude -p`.
