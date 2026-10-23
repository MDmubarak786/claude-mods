# guard-setup

Set up the guard mods for this project from its own files: the fence paths, the pins, a .claude/style-cop.md, and the red-green test command, as commands to paste and one file to write.

Four mods in this marketplace guard a project, and each needs one per-project setting that people skip: [`fence`](../../mods/fence/) wants the paths Claude may edit, [`pins`](../../mods/pins/) wants the rules that must outlive compaction, [`style-cop`](../../mods/style-cop/) wants a `.claude/style-cop.md`, and [`red-green`](../../mods/red-green/) wants the test command. This skill reads the repository, the lockfile, CI, and `CLAUDE.md`, and drafts all four at once. You approve, it writes the one file it owns, and you paste three commands.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install guard-setup@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./skills/guard-setup
```

## Use it

Type `/guard-setup:guard-setup`, or ask in your own words. Prompts that trigger it:

- "Set up the guard mods for this repo. Keep Claude out of the migrations and run the tests after every edit."
- "Configure fence and style-cop for this project."
- "Stop Claude writing comments everywhere in this codebase, and make it use pnpm."

The reply says which of the four mods are installed here, then proposes: a `/fence` line with the folders you work in and a note on what was left out; two to five `/pin` lines taken from `CLAUDE.md` and the conventions it can see; the contents of `.claude/style-cop.md` with banned phrases, a comment-ratio cap, the files that must stay comment-free, and the style rules from `CLAUDE.md`; and a `/red-green` line with the command CI runs. On your OK it writes `.claude/style-cop.md` and repeats the three lines to paste.

The fence, the pins, and the test command live in each mod's own store and are set only by `/fence`, `/pin`, and `/red-green`, so the skill prints them instead of claiming to set them. It never edits `settings.json`, installs anything, or runs your tests.

## What it touches

From `node scripts/sync-touches.mjs`, read from `SKILL.md` and this folder:

```text
skill: guard-setup
invoked by: user and Claude
tools: none granted
runs in: the main session
hooks: none
reads: references/guards.md
bundled: none
shell at load: none
```

A skill is text Claude reads when it is invoked. It grants no permissions of its own: writing `.claude/style-cop.md` goes through your permission prompt like any other edit. `references/guards.md` is each mod's command syntax, file format, and the defaults a draft starts from. Loading the skill adds about 220 tokens to every session and about 1,700 more when it runs, as `claude --plugin-dir ./skills/guard-setup plugin details guard-setup` estimates; those figures change between Claude Code releases and are not checked by CI.

## Tested with

- Claude Code 2.1.308 in the terminal, with `claude plugin eval ./skills/guard-setup --scaffold`. The should-trigger case asks to set up the guards on a small pnpm project with migrations, a `dist` folder, a `CLAUDE.md`, and CI. With the skill, all 3 runs pass, judged by Sonnet against the committed rubric: a fence of `src/ tests/`, pins taken from `CLAUDE.md`, a `.claude/style-cop.md` draft, and `/red-green pnpm test -- --run`, all offered as commands to paste. Without the skill, all 3 runs fail: Claude doesn't know the guard mods exist and writes a new mod or a settings file instead. The skill fired on every should-trigger run and on none of the 6 must-not-trigger runs. A first pass with the default Haiku judge failed one correct answer that mentioned "never npm or yarn" in a pin; the rubric now says how to treat that.

## Limitations

- It drafts; you decide. A fence proposed from the folder layout can be too narrow for the task at hand; widen it with `/fence` when a turn needs more.
- One project root at a time. In a monorepo it proposes the root you are in and says what is left out.
- It reads `enabledPlugins` from the settings files to say what is installed. A plugin enabled some other way (a managed setting, `--plugin-dir`) shows as not installed.
- The draft is only as good as the files: a project with no `CLAUDE.md`, no CI, and no lockfile gets generic defaults and a question about where you work.

## License

MIT, see the repository root.
