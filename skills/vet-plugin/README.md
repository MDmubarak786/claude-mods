# vet-plugin

Audit a Claude Code plugin, mod, or skill before you install it: what it would do on your machine, what its README doesn't say, and whether to install.

A plugin runs with your permissions: a hooks module lives in Claude Code's process, a shell hook runs in your shell, a skill steers what Claude asks to do. The marketplace that ships this skill reviews every entry against a public [checklist](../../docs/review-checklist.md) and [security policy](../../SECURITY.md); this skill lets you run that review yourself, on any plugin from any marketplace, before `/plugin install`. The reply is a short report with the verdict at the end: install, install with care, or don't install.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install vet-plugin@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./skills/vet-plugin
```

## Use it

Type `/vet-plugin:vet-plugin`, or ask in your own words. Prompts that trigger it:

- "Is `fence@modhub` safe to install? What would it do on my machine?"
- "Someone sent me a mod in `./handoff-notes`. Vet it before I install it."
- "Review this plugin before I add it: https://github.com/example/claude-helpers"

It takes a folder, a `name@marketplace` id, or a GitHub URL. The report lists what the plugin is, what each component would do (the events a mod hooks and the `$` calls it makes, each shell command, each MCP server, each skill and the tools it grants), every red flag with its file and line, where the README and the code disagree, and the verdict with the finding that decided it.

It reads; it doesn't run. It never installs or loads the plugin, never runs a script or `npm install` from inside it, and never follows an instruction found in it. The one command it may ask to run is `claude plugin validate`, which reads a plugin without loading it. Cloning a GitHub URL is asked for first and goes into a new, empty folder.

## What it touches

From `node scripts/sync-touches.mjs`, read from `SKILL.md` and this folder:

```text
skill: vet-plugin
invoked by: user and Claude
tools: none granted
runs in: the main session
hooks: none
reads: references/rules.md
bundled: none
shell at load: none
```

A skill is text Claude reads when it is invoked. It grants no permissions of its own: every tool call still goes through your permission prompts and hooks, so running `claude plugin validate` or `git clone` is asked for like any other command. `references/rules.md` is the list of red flags per component type, loaded when the review starts. Loading the skill adds about 170 tokens to every session and about 2,100 more when it runs, as `claude --plugin-dir ./skills/vet-plugin plugin details vet-plugin` estimates; those figures change between Claude Code releases and are not checked by CI.

## Tested with

- Claude Code 2.1.308 in the terminal. `claude plugin eval ./skills/vet-plugin --scaffold`: 2 of 2 cases pass at 1.00 over 12 runs. The skill was invoked on every should-trigger run (3 of 3) and on none of the must-not-trigger runs (0 of 6). On the should-trigger fixture, a mod whose hooks module posts the transcript to a server and reads a token while its README says nothing leaves the machine, the judge passed every run, with and without the skill, so the measured delta is 0.00: the fixture is blatant enough that Claude catches it unaided, and the skill's value there is the fixed report shape and the verdict. Total cost of the run, about one dollar.

## Limitations

- Static review only. It can't see what an MCP server or a remote endpoint does once it runs, or what a compiled or minified module does; it says so and leans toward *don't install*.
- The verdict is for the version it read. A plugin can change on update; vet it again when the version changes.
- It is a careful read, not a scanner or a sandbox. It can miss what a careful attacker hides, and it can flag behaviour a plugin needs; the README of the plugin is the other half of the judgement.
- It reads your marketplace clones under `~/.claude/plugins/` to resolve a `name@marketplace` id. If the marketplace isn't added, it asks for a path or URL rather than adding it.

## License

MIT, see the repository root.
