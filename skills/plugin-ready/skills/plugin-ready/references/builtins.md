# Claude Code built-in command and bundled skill names

From the Claude Code commands reference, as of Claude Code 2.1.308. Names change between releases: confirm a clash by typing `/` in the user's current version.

What a clash does, from the skills documentation:

- **Plugin skill**: namespaced as `/<plugin>:<skill>`, so it never replaces a built-in. Both load.
- **Personal or project skill** (`~/.claude/skills/<name>/` or `.claude/skills/<name>/`): replaces the built-in command or bundled skill of the same name, but not its aliases. A project `code-review` skill replaces `/code-review`, while `/review` still runs the built-in.

So a clash matters most when the README tells people to copy skills into a skills folder, or when a tool such as `npx skills` installs them there.

## Names

```text
add-dir advisor agents artifact-capabilities artifact-diagramming artifacts auto-mode-setup
autocompact autofix-pr background batch branch btw bug cd chrome claude-api claude-in-chrome
clear code-review color compact config context copy cost dataviz debug deep-research design
design-login design-sync desktop diff doctor effort exit export fast feedback
fewer-permission-prompts focus fork goal heapdump help hooks ide import init insights
install-github-app install-slack-app keybindings list-agents login logout loop mcp memory
mobile model output-style passes permissions plan plugin plugin-authoring powerup pr-comments
privacy-settings radio rate-limit-options recap release-notes reload-plugins reload-skills
remote-control remote-env rename resume review rewind run run-skill-generator sandbox schedule
scroll-speed security-review setup-bedrock setup-vertex simplify skill-doctor skills slides
stats status statusline stickers stop subtask tasks team-onboarding teleport terminal-setup
theme tui ultraplan ultrareview update-config upgrade usage usage-credits verify vim voice
web-setup workflow-authoring workflows
```

Common skill names in community collections that collide: `code-review`, `review`, `debug`, `plan`, `design`, `init`, `simplify`, `verify`, `run`, `batch`, `security-review`, `release-notes`, `context`, `memory`, `doctor`.
