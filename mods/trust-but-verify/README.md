# trust-but-verify

Check what Claude claims against what it ran. "All tests pass." No test command ran. "I committed the changes." No `git commit` in the turn. "Verified." Nothing was read or run. A long-running issue on the Claude Code tracker documents months of exactly this.

After a turn, when the answer makes one of those claims, a line under it says whether a matching command actually ran this turn and whether it succeeded. The line is for you; Claude doesn't read it, and no follow-up turn is started.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install trust-but-verify@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/trust-but-verify
```

## Use it

Nothing to do. Under an answer that makes a claim:

```text
trust-but-verify: ✔ tests pass, backed by `npm test -- --run`
trust-but-verify: ✘ claims tests pass, but no matching command ran this turn
trust-but-verify: ✘ claims build succeeds, but `npm run build` failed
```

| Claim in the answer | Evidence looked for in this turn's Bash calls |
| :-- | :-- |
| tests pass, tests are green, ran the tests | `npm test`, `pytest`, `go test`, `cargo test`, `jest`, `vitest`, `mocha`, `phpunit`, `rspec`, `make test`, `dotnet test`, `mvn test`, `gradle test`, and others |
| build succeeds, compiles cleanly, type-checks pass | `npm run build`, `tsc`, `cargo build`, `go build`, `make`, `gradle build`, `mvn package`, `dotnet build`, `xcodebuild`, `swift build` |
| lint is clean | `eslint`, `npm run lint`, `ruff`, `flake8`, `pylint`, `golangci-lint`, `cargo clippy`, `rubocop`, `biome` |
| committed | `git commit` |
| pushed | `git push` |
| verified, confirmed, validated | Any command, read, search, or MCP call. This one only notes what ran; it can't judge whether that was enough. |

| Command | What it does |
| :-- | :-- |
| `/claims` | Show the verdicts from this session. |
| `/claims off`, `/claims on` | Hide or show the verdict line. Remembered. |

## What it touches

From `claude plugin validate ./mods/trust-but-verify`:

```text
hooks: session.start, command.run{command=claims}, turn.start, tool.call, turn.complete
calls: $.command.register, $.store.get, $.store.set, $.ui.log
```

- **`tool.call`** observes every call of the main conversation and passes it through unchanged. Only the tool name, a Bash command's text, and whether it errored are kept, for the current turn.
- **`turn.complete`** returns a line of text under the answer. It never starts a turn, calls a model, or changes what Claude reads.
- **`$.store`** holds the on/off flag. No files, processes, or network.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass. `/claims` answered from a live `claude -p` session.

## Limitations

- Claims are matched by phrase. An answer that says "the suite is happy" isn't recognized; one that quotes the user ("you said tests pass") may be.
- Evidence is matched by command name. A test runner not in the list, or tests run through a script with another name, shows as "no matching command ran." Add it by pull request.
- A command that ran and exited 0 counts as success even if its output says otherwise.
- The planned automatic follow-up ("you said the tests pass, run them now") is deliberately not built. It would start turns and spend tokens on a regex's say-so. The `receipt` mod in the ecosystem names unverified claims similarly; this one checks them against the commands that ran.

## License

MIT, see the repository root.
