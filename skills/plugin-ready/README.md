# plugin-ready

Make a folder of skills installable and updatable with /plugin: a marketplace.json, versions that move when files change, names checked against Claude Code's built-in commands, strict validation, and install lines in the README.

The largest skill collections share the same publishing complaints: no `marketplace.json`, so `/plugin` can't install the repository; a `version` pinned in `plugin.json` that never moves, so every user stays on an old copy; and a skill named like a built-in command, so it replaces that command for anyone who copies it into a skills folder. This repository solves those for its own catalog with `ship.sh`, `check-version-bump.sh`, and `validate.sh`; this skill does the same for any author's repository.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install plugin-ready@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./skills/plugin-ready
```

## Use it

Type `/plugin-ready:plugin-ready`, or ask in your own words. Prompts that trigger it:

- "People can't install my skills repo with /plugin. Fix it."
- "Users say they're stuck on version 1.2.3 and never get my updates."
- "Add a marketplace.json and plugin.json to this repo so it works as a Claude Code marketplace."

It inventories the skills, manifests, version history, and the README's current install story, then checks names against the reserved list and the built-in commands, frontmatter against the listing limits, and why updates do or don't reach users. It proposes a layout (one plugin for the collection, or one per skill), a version strategy (pin and bump with a check, or track commits), each name clash with a suggested rename, and the README lines users will run. After you approve, it writes the files, bumps the version if needed, and runs or gives you `claude plugin validate --strict`.

It never pushes, tags, or publishes, and never renames a skill without your yes, since a rename breaks existing installs. It offers a CI workflow for validation and the version check rather than adding one.

## What it touches

From `node scripts/sync-touches.mjs`, read from `SKILL.md` and this folder:

```text
skill: plugin-ready
invoked by: user and Claude
tools: none granted
runs in: the main session
hooks: none
reads: references/builtins.md, references/marketplace.md
bundled: none
shell at load: none
```

A skill is text Claude reads when it is invoked. It grants no permissions of its own: the files it writes, and the `git log`, `git diff`, and `claude plugin validate` commands it may run to read history and check the result, all go through your permission prompts. `references/marketplace.md` holds the manifest, marketplace, naming, and version rules from the Claude Code docs, and a version-bump check to adapt; `references/builtins.md` lists the built-in command and bundled skill names as of Claude Code 2.1.308. Loading the skill adds about 160 tokens to every session and about 1,600 more when it runs, as `claude --plugin-dir ./skills/plugin-ready plugin details plugin-ready` estimates; those figures change between Claude Code releases and are not checked by CI.

## Tested with

- Claude Code 2.1.308 in the terminal, with `claude plugin eval ./skills/plugin-ready --scaffold --allow-tools Write Edit --judge-model sonnet`. The should-trigger case writes a skills repository as a git repo: a `plugin.json` pinned at 1.2.3 and never bumped after two skills changed, no `marketplace.json`, a `code-review` skill named like the built-in, and a README that says to copy skills into `~/.claude/skills/`. The user reports being stuck on 1.2.3 and approves changes up front. Graders: a `marketplace.json` exists, the version moved off 1.2.3, the README has the install line, and a Sonnet judge reads the reply for the cause, the install commands, the release rule, and the name clash.
  - With the skill: 1.00, all 3 runs passing every check.
  - Without the skill: 0.83. Every run wrote the marketplace file, moved the version, and added the install line; two of three never flagged that `code-review` replaces the built-in `/code-review` for anyone who copies it in.
  - The skill fired on every should-trigger run and on none of the 6 must-not-trigger runs. The eval can't grant a shell on this machine, so the skill's git-history check wasn't exercised; it fell back to reading the files.

## Limitations

- The built-in names change with Claude Code releases. The list is dated; it tells you to confirm a clash by typing `/` in your version.
- It can't see how your users installed the skills. If some copied them into a skills folder, a rename there is up to them.
- It works on one repository. A marketplace that points at plugins in other repositories needs each of those made ready on its own.
- It writes the files and validates them; publishing, tagging a release, and announcing the install lines are yours.

## License

MIT, see the repository root.
