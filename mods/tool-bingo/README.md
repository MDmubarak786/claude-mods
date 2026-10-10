# tool-bingo

Tool-call bingo. Every day you get a 5×5 card of things Claude does: ran the tests, read a README, edited the same file three times, interrupted mid-turn, went online. The squares fill in by themselves as Claude works. When a row, column, or diagonal completes, a toast says BINGO.

It costs nothing: no tokens, no model calls, no effort. It watches the events Claude Code already raises and keeps score. The same card is drawn in every session on your machine for the day, and marks are shared, so a line can be finished across sessions.

```text
Bingo for 2026-10-10 · 7/24 marked · 1 line (row 2)
[ ] ran tests    [x] used Grep    [ ] git push     [ ] asked you    [ ] docker/k8s
[x] read README  [x] used Glob    [x] wrote a file [x] edited .md   [x] cmd && cmd
[ ] subagent     [ ] night owl    [ ] FREE         [ ] 10+ tools    [ ] went online
[ ] call refused [x] git status   [ ] 2 min turn   [ ] installed    [ ] one-liner
[ ] bash failed  [ ] read config  [ ] no tools     [ ] retried cmd  [ ] compaction
```

Screenshot of the pane wanted: nobody has photographed it yet.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install tool-bingo@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/tool-bingo
```

## Use it

| Command | What it does |
| :-- | :-- |
| `/tool-bingo` | Open the card in a pane. Where no pane can be drawn, print it instead. |
| `/tool-bingo card` | Print the card as text. |
| `/tool-bingo new` | Reshuffle today's card. Marks start over. |
| `/tool-bingo loud`, `/tool-bingo quiet` | Toast every square as it fills, or only completed lines (the default). |
| `/tool-bingo stats` | Cards played, lines completed, blackouts. |

In the pane, **n** draws a new card, **l** toggles loud, and Esc closes it. The pane needs about 55 columns for bordered cells; narrower, it draws one compact text row per card row.

## The squares

A card is 24 of these plus a FREE center, drawn from the date so every session agrees on the day's card.

<!-- squares:start -->
<!-- Generated from hooks/squares.ts by scripts/sync-squares.mjs. Do not edit by hand. -->
| Square | Marked when |
| :-- | :-- |
| `ran tests` | A Bash command ran a test runner: npm/pnpm/yarn/bun test, pytest, go test, cargo test, jest, vitest, mocha, rspec, phpunit, make test, dotnet test, mvn test, gradle test, or ctest. |
| `git commit` | A Bash command ran `git commit`. |
| `git push` | A Bash command ran `git push`. |
| `git status` | A Bash command ran `git status`, `diff`, `log`, `show`, or `blame`. |
| `installed` | A Bash command installed a package with npm, pnpm, yarn, bun, pip, uv, cargo, go get, or brew. |
| `ran a build` | A Bash command ran a build or type check: npm run build, tsc, cargo build, go build, make, gradle, mvn, dotnet build, xcodebuild, or swift build. |
| `ran a linter` | A Bash command ran eslint, npm run lint, ruff, flake8, pylint, golangci-lint, cargo clippy, rubocop, or biome. |
| `curl/wget` | A Bash command used curl or wget. |
| `docker/k8s` | A Bash command used docker or kubectl. |
| `rm -r` | A Bash command ran a recursive rm. |
| `cmd && cmd` | A Bash command chained two commands with && or \|\|. |
| `used a pipe` | A Bash command piped one command into another. |
| `read README` | Claude read a file whose name contains README. |
| `read a .md` | Claude read a Markdown file. |
| `read config` | Claude read a .json, .yaml, .yml, .toml, or .ini file. |
| `edited tests` | Claude edited or wrote a test file: a name with .test., .spec., or _test., or a path under tests/ or test/. |
| `edited .md` | Claude edited or wrote a Markdown file. |
| `wrote a file` | Claude wrote a whole file with the Write tool. |
| `notebook` | Claude edited a Jupyter notebook. |
| `used Grep` | Claude searched file contents with the Grep tool. |
| `used Glob` | Claude searched file names with the Glob tool. |
| `went online` | Claude used WebFetch or WebSearch. |
| `todo list` | Claude wrote its task list with TodoWrite. |
| `asked you` | Claude asked you a question with AskUserQuestion. |
| `MCP tool` | Claude called a tool from an MCP server (not one this repository's mods add). |
| `bash failed` | A Bash command exited with an error. |
| `call refused` | A mod refused a tool call, for example fence, right-tool, pkg-guard, or tripwire. |
| `10+ tools` | One turn made ten or more tool calls. |
| `5+ files` | One turn edited five or more different files. |
| `same file ×3` | One turn edited the same file three or more times. |
| `3 languages` | One turn edited files with three or more different extensions. |
| `10+ reads` | One turn read ten or more files. |
| `2 min turn` | A turn took two minutes or longer. |
| `no tools` | Claude answered a turn without using any tool. |
| `interrupted` | You interrupted a turn. |
| `long answer` | An answer was 2,000 characters or longer. |
| `one-liner` | An answer was under 60 characters. |
| `retried cmd` | One turn ran the exact same Bash command twice. |
| `night owl` | A turn ended between 10 pm and 5 am, by your clock. |
| `subagent` | Claude started a subagent. |
| `compaction` | The conversation was compacted. |
| `you: /cmd` | You ran a slash command (other than /tool-bingo). |
<!-- squares:end -->

Only the main conversation is watched. What a subagent does counts as one square, `subagent`, however many tools it uses.

## What it touches

From `claude plugin validate ./mods/tool-bingo`:

```text
hooks: session.start, classic.SessionStart{source=clear|resume|fork}, command.run{command=tool-bingo}, command.run, turn.start, tool.call, turn.complete, agent.spawn, session.compact, ui.render{component=Pane}
calls: $.clock.now, $.command.register, $.state.get, $.state.set, $.store.delete (via prune), $.store.get (via load, mark, savedStats), $.store.keys (via prune), $.store.set, $.ui.log, $.ui.open, $.ui.resolve, $.ui.toast (via mark)
```

- **`tool.call`**, **`turn.start`**, **`turn.complete`**, **`agent.spawn`**, **`session.compact`**, and the unmatched **`command.run`** hook only observe. Every call and event passes through unchanged, and a square that can't be judged is skipped without touching the call.
- **`$.store`** keeps the day's card and marks (shared by every session on the machine), the loud flag, and the stats. Cards older than 14 days are pruned at session start.
- **`$.clock`** supplies the date for the day's card and the hour for `night owl`.
- No files, processes, model calls, or network.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` passing, including mounted pane tests at wide and narrow widths. Loaded into a Desktop app 2.1.293 session through hot reloading.

## Limitations

- Squares are judged from command text and file paths, not from what happened. `ran tests` means a test runner was invoked, not that tests passed.
- `night owl` uses the clock of the machine Claude Code runs on.
- Two sessions marking the same card at the same moment can each miss the other's newest mark until the next one lands; marks are merged on every write.
- The card changes at local midnight. A turn that straddles it marks the new day's card.
- Compaction is a square only when the main conversation compacts.

## License

MIT, see the repository root.
