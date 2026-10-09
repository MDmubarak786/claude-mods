#!/usr/bin/env bash
# Fail if a mod's files changed since <base> but its plugin.json version did not.
# Claude Code delivers a plugin update only when the version string changes.
# Usage: scripts/check-version-bump.sh <base-ref>
set -euo pipefail

base="${1:-origin/main}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
failed=0

changed_mods="$(git diff --name-only "$base"...HEAD -- mods/ | awk -F/ 'NF>1 {print $2}' | sort -u)"
for name in $changed_mods; do
  manifest="mods/$name/.claude-plugin/plugin.json"
  if ! git cat-file -e "$base:$manifest" 2>/dev/null; then
    echo "mods/$name: new mod, no bump needed"
    continue
  fi
  old="$(git show "$base:$manifest" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version ?? ''")"
  new="$(node -p "require('./$manifest').version ?? ''")"
  if [[ "$old" == "$new" ]]; then
    echo "::error file=$manifest::mods/$name changed but version is still '$old'. Bump it so installed users receive the change."
    failed=1
  else
    echo "mods/$name: $old -> $new"
  fi
done
exit $failed
