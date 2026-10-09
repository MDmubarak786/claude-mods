#!/usr/bin/env bash
# Scaffold a new mod from templates/mod, add it to the marketplace, and validate it.
# Usage: scripts/new-mod.sh <name> "<one-sentence description>"
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
name="${1:-}"
description="${2:-}"

if [[ -z "$name" || -z "$description" ]]; then
  echo "usage: scripts/new-mod.sh <name> \"<one-sentence description>\"" >&2
  exit 2
fi
if [[ ! "$name" =~ ^[a-z][a-z0-9-]{0,63}$ ]]; then
  echo "error: name must be lowercase letters, digits, and hyphens, starting with a letter (got '$name')" >&2
  exit 2
fi
if [[ "$name" == *claude* || "$name" == *anthropic* ]]; then
  echo "error: names containing 'claude' or 'anthropic' are reserved by Claude Code and fail strict validation" >&2
  exit 2
fi
if [[ -e "$root/mods/$name" ]]; then
  echo "error: mods/$name already exists" >&2
  exit 2
fi

author="$(git -C "$root" config user.name 2>/dev/null || true)"
author="${author:-Your Name}"

cp -R "$root/templates/mod" "$root/mods/$name"
mv "$root/mods/$name/tests/__NAME__.test.ts" "$root/mods/$name/tests/$name.test.ts"

# Fill in the placeholders. Perl handles the in-place edit portably on macOS and Linux.
export NEW_MOD_NAME="$name" NEW_MOD_DESCRIPTION="$description" NEW_MOD_AUTHOR="$author"
find "$root/mods/$name" -type f -exec perl -pi -e '
  s/__NAME__/$ENV{NEW_MOD_NAME}/g;
  s/__DESCRIPTION__/$ENV{NEW_MOD_DESCRIPTION}/g;
  s/__AUTHOR__/$ENV{NEW_MOD_AUTHOR}/g;
' {} +

# Add the marketplace entry.
node - "$root/.claude-plugin/marketplace.json" "$name" "$description" <<'NODE'
const [file, name, description] = process.argv.slice(2)
const fs = require('node:fs')
const marketplace = JSON.parse(fs.readFileSync(file, 'utf8'))
if (marketplace.plugins.some((p) => p.name === name)) {
  console.error(`error: marketplace already lists ${name}`)
  process.exit(1)
}
marketplace.plugins.push({ name, source: `./mods/${name}`, description, category: 'other', tags: [] })
marketplace.plugins.sort((a, b) => a.name.localeCompare(b.name))
fs.writeFileSync(file, JSON.stringify(marketplace, null, 2) + '\n')
NODE

node "$root/scripts/update-readme.mjs"
claude plugin validate "$root/mods/$name"

cat <<MSG

Created mods/$name.

Next:
  1. scripts/try.sh $name                 load it in a session and edit hooks/register.ts while it runs
  2. cd mods/$name && claude plugin test  run its tests
  3. Fill in mods/$name/README.md
  4. Add a line for /mods/$name/ to .github/CODEOWNERS
  5. Set category and tags for $name in .claude-plugin/marketplace.json
MSG
