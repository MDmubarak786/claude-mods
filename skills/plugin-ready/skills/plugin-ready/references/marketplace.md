# Marketplace, manifest, and version rules

From the Claude Code plugin manifest, marketplace, and loading references. Check `claude plugin validate --strict` for the final word on any file.

## Layouts

**One plugin for the whole collection** (what most skill repositories want):

```text
repo/
├── .claude-plugin/
│   ├── marketplace.json      lists one plugin with "source": "./"
│   └── plugin.json
├── skills/
│   ├── <skill-a>/SKILL.md
│   └── <skill-b>/SKILL.md
└── README.md
```

```json
{
  "name": "<marketplace-name>",
  "owner": { "name": "<author>" },
  "description": "<one sentence>",
  "plugins": [
    { "name": "<plugin-name>", "source": "./", "description": "<one sentence>", "category": "<topic>", "tags": ["skills"] }
  ]
}
```

Skills install as `/<plugin-name>:<skill>`.

**One plugin per skill** (users pick what they install): each skill in its own folder such as `plugins/<skill>/` with `.claude-plugin/plugin.json` and `skills/<skill>/SKILL.md`, and one entry per plugin with `"source": "./plugins/<skill>"`. Skills install as `/<skill>:<skill>`.

## marketplace.json

- Lives at `.claude-plugin/marketplace.json` in the repository root, so `/plugin marketplace add <owner>/<repo>` finds it.
- Required: `name`, `owner.name`, `plugins`. Add `description`; validate warns without it.
- Each entry needs `name` and `source`. A relative `source` starts with `./` and resolves from the repository root, not from `.claude-plugin/`; it can't contain `..`. `"./"` or `"."` means the root itself.
- Don't set `version` in an entry when `plugin.json` sets one: `plugin.json` wins and validate warns.
- `renames`: a map from a former plugin name to its new name, or to `null` for a removed plugin, so existing installs follow or see it was removed. Add `"forceRemoveDeletedPlugins": true` only if removed plugins should be uninstalled from users' machines.
- Unknown keys are ignored silently at load and reported as warnings by validate, which `--strict` fails.

## plugin.json

- Lives at `<plugin>/.claude-plugin/plugin.json`. Only the manifest goes in `.claude-plugin/`; `skills/` sits at the plugin root.
- `name` is required; add `version` (if pinning), `description`, `author.name`, `license`, `homepage`, `repository`. Validate warns on missing `description` and `author`.
- No `CLAUDE.md` at the plugin root: it isn't loaded, and strict validation warns.

## Names

- Marketplace and plugin names: letters, digits, `.`, `_`, `-`, starting with a letter or digit; use lowercase kebab-case. No spaces, `@`, `:`, or slashes.
- Reserved plugin names: starting with `claude-`, `anthropic-`, `anthropics-`, or `cc-plugin-`; exactly `claude`, `anthropic`, `anthropics`, `claude-code`, `claude-mods`; `official` next to `claude` or `anthropic`. `claude`, `anthropic`, or `anthropics` as a whole word elsewhere is a warning.
- Reserved marketplace names include `claude-code-marketplace`, `claude-code-plugins`, `claude-plugins-official`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `anthropic-agent-skills`, `claude-community`, `inline`, `builtin`, `skills-dir`, `synced`, `npm`, `pip`, `uv`, `cargo`, `github`, `gh`, names starting with `claudeai-`, anything that imitates an official name, and any non-ASCII name. Pick something with the author's or project's name in it.
- A skill's invoked name is its folder name unless frontmatter `name` overrides the last segment; keep them equal.

## How updates reach users

Claude Code computes a version for each installed plugin and replaces the cached copy only when that version changes. In order:

1. `version` in `plugin.json`.
2. `version` in the marketplace entry.
3. Neither set: for a relative-path plugin in a GitHub-hosted marketplace, the commit SHA of its directory; for a `github` or `url` source, the source's commit SHA.

So a pinned `"version": "1.2.3"` keeps every user on the 1.2.3 copy, however many commits follow, until the string changes. That is the usual cause of "stuck on an old version".

Two strategies, pick one:

- **Pin and bump.** Set `version` in `plugin.json`, bump it in the same commit as any change to the plugin's files (README-only changes can skip it), and add a check that fails when plugin files changed but the version didn't.
- **Track commits.** Leave `version` out of both `plugin.json` and the entry. Every commit that touches the plugin's directory is a new version. Simpler, but users get unreviewed work-in-progress if you commit to the default branch directly.

Auto-update: on by default only for Anthropic's official marketplaces and those added from claude.ai, off for everyone else. Users turn it on under `/plugin`, Marketplaces, `<name>`, Enable auto-update, or run `/plugin marketplace update <name>` and then `/reload-plugins`.

## A version-bump check

For pin-and-bump, a CI step comparing the pull request with its base. Adapt the paths:

```bash
base="${1:-origin/main}"
manifest=".claude-plugin/plugin.json"
if git diff --name-only "$base"...HEAD -- . | grep -Ev '^(README\.md|\.github/)' | grep -q .; then
  old="$(git show "$base:$manifest" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")"
  new="$(node -p "require('./$manifest').version")"
  [ "$old" != "$new" ] || { echo "plugin files changed but version is still $old"; exit 1; }
fi
```

And a validate step: `npm install -g @anthropic-ai/claude-code`, then `claude plugin validate --strict .` and the same on each plugin folder.

## Install lines for the README

```text
/plugin marketplace add <owner>/<repo>
/plugin install <plugin>@<marketplace>
```

From a shell: `claude plugin marketplace add <owner>/<repo>` and `claude plugin install <plugin>@<marketplace>`. To try without installing: `claude --plugin-dir ./<plugin-folder>`.
