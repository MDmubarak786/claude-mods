#!/usr/bin/env bash
# Fail if a mod's or skill's files changed since <base> but its plugin.json version did not.
# Claude Code delivers a plugin update only when the version string changes.
# Usage: scripts/check-version-bump.sh <base-ref>
set -euo pipefail

base="${1:-origin/main}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
failed=0

# A change to a plugin's README or screenshots alone reaches nobody through the plugin, so it
# needs no bump; any other file under the plugin does. For a skill that includes SKILL.md and evals/.
changed="$(git diff --name-only "$base"...HEAD -- mods/ skills/ | { grep -Ev '^(mods|skills)/[^/]+/(README\.md|screenshots/)' || true; } | awk -F/ 'NF>2 {print $1"/"$2}' | sort -u)"
for dir in $changed; do
  manifest="$dir/.claude-plugin/plugin.json"
  if ! git cat-file -e "$base:$manifest" 2>/dev/null; then
    echo "$dir: new, no bump needed"
    continue
  fi
  if [[ ! -f "$manifest" ]]; then
    echo "$dir: removed, no bump needed"
    continue
  fi
  old="$(git show "$base:$manifest" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version ?? ''")"
  new="$(node -p "require('./$manifest').version ?? ''")"
  if [[ "$old" == "$new" ]]; then
    echo "::error file=$manifest::$dir changed but version is still '$old'. Bump it so installed users receive the change."
    failed=1
  else
    echo "$dir: $old -> $new"
  fi
done
exit $failed
