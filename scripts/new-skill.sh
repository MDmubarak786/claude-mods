#!/usr/bin/env bash
# Scaffold a new skill from templates/skill, add it to the marketplace, and validate it.
# Usage: scripts/new-skill.sh <name> "<one-sentence description>"
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
name="${1:-}"
description="${2:-}"

if [[ -z "$name" || -z "$description" ]]; then
  echo "usage: scripts/new-skill.sh <name> \"<one-sentence description>\"" >&2
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
if [[ -e "$root/skills/$name" || -e "$root/mods/$name" ]]; then
  echo "error: $name already exists under skills/ or mods/" >&2
  exit 2
fi

author="$(git -C "$root" config user.name 2>/dev/null || true)"
author="${author:-Your Name}"

mkdir -p "$root/skills"
cp -R "$root/templates/skill" "$root/skills/$name"
mv "$root/skills/$name/skills/__NAME__" "$root/skills/$name/skills/$name"

# Fill in the placeholders. Perl handles the in-place edit portably on macOS and Linux.
export NEW_SKILL_NAME="$name" NEW_SKILL_DESCRIPTION="$description" NEW_SKILL_AUTHOR="$author"
find "$root/skills/$name" -type f -exec perl -pi -e '
  s/__NAME__/$ENV{NEW_SKILL_NAME}/g;
  s/__DESCRIPTION__/$ENV{NEW_SKILL_DESCRIPTION}/g;
  s/__AUTHOR__/$ENV{NEW_SKILL_AUTHOR}/g;
' {} +

node "$root/scripts/lib/add-catalog-entry.mjs" "$name" "./skills/$name" "$description" skill
node "$root/scripts/update-readme.mjs"
claude plugin validate --strict "$root/skills/$name"
# The template has placeholders on purpose, so this names what to fill in rather than failing.
node "$root/scripts/check-skills.mjs" "$root/skills/$name" || echo "(the lines above are what to fill in before you ship)"

cat <<MSG

Created skills/$name.

Next:
  1. Write skills/$name/skills/$name/SKILL.md: the description decides when Claude invokes it
  2. claude --plugin-dir ./skills/$name      try it; type / to see /$name:$name
  3. Fill in the two eval cases under skills/$name/evals/, then:
     claude plugin eval ./skills/$name       runs them on your account; put the score in the README
  4. Fill in skills/$name/README.md, then: node scripts/sync-touches.mjs
  5. Add a line for /skills/$name/ to .github/CODEOWNERS
  6. Set category and tags for $name in .claude-plugin/marketplace.json
  7. scripts/ship.sh $name "Add $name: <what it does>" --pr   branch, commit, and open the pull request
MSG
