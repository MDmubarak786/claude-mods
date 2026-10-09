# red-green

Run the project's tests after any turn in which Claude edited a file, print pass or fail under Claude's answer, and send a failure back to Claude with one `/fix` command. It closes the gap between "done" and "tests pass" without you running anything.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install red-green@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/red-green
```

## Use it

Set the command once per project:

```text
/red-green detect
```

That picks `npm test`, `pnpm test`, or `yarn test` from `package.json`, or `pytest`, `cargo test`, `go test ./...`, or `make test` from the files it finds. Or name it yourself: `/red-green npm test -- --run`.

From then on, after a turn in which Claude edited a file, a line appears under the answer:

```text
red-green: tests passed (npm test, 4.2s)
red-green: tests FAILED, exit 1 (npm test, 6.8s). /fix sends the failure to Claude.
```

`/fix` starts a new turn with the last 30 lines of output and asks Claude to fix the failures and run the tests again. The turn starts right after the command returns.

| Command | What it does |
| :-- | :-- |
| `/red-green <command>` | Set the test command for this project. Saved. |
| `/red-green detect` | Pick one from the project's files. |
| `/red-green` | Show the command and the last result. |
| `/red-green off`, `/red-green on` | Pause or resume. |
| `/fix` | Send the last failure to Claude. |

Nothing runs when nothing was edited, after an interrupted turn, or for a subagent's turn.

**When Claude changed what the tests run.** The command runs outside Claude Code's permission prompts, so if Claude edited `package.json`, a Makefile, `pyproject.toml`, a test runner's config, or a file named in the command itself during the turn, running it would execute code Claude just wrote. In that case a question asks first, and the default is to skip:

```text
red-green: skipped npm test because Claude changed package.json this turn. Review it, then run the tests yourself or ask Claude to.
```

## What it touches

From `claude plugin validate ./mods/red-green`:

```text
hooks: session.start, command.run{command=red-green}, command.run{command=fix}, tool.call{tool=Edit|Write|MultiEdit|NotebookEdit}, turn.complete
calls: $.clock.after, $.command.register, $.fs.exists (via detect), $.fs.read (via detect), $.process.run (via run), $.prompt.submit, $.session.root (via load), $.store.get (via load), $.store.set (via save), $.ui.ask, $.ui.log
```

- **`$.process.run`** runs the test command you set, through `sh -c`, in the project root, with a 3-minute timeout. It runs only after a turn that edited files, and not without asking when that turn also changed a file that defines the tests. Nothing else is run.
- **`$.prompt.submit`** starts a turn only when you run `/fix`, in the mod's own name, never as you. It's scheduled with a zero-delay **`$.clock.after`** because a command can't submit a prompt while it holds the turn.
- **`tool.call`** observes edits and passes every call through unchanged.
- **`$.store`** holds the command and the on/off flag, per project.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass. `/red-green` answered from a live `claude -p` session. A real test run after a real edit hasn't been exercised on screen by the author yet.

## Limitations

- The command runs through your shell as written, so quote it the way you would at a prompt.
- A test suite longer than 3 minutes is cut off and reported as a failure to run.
- One run at a time: if a turn ends while a run is still going, that turn isn't tested.
- Under `claude -p` nobody can answer the question above, so a turn that changed a test-defining file skips the run.

## License

MIT, see the repository root.
