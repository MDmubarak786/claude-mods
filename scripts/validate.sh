#!/usr/bin/env bash
# Everything CI checks: marketplace manifest, every mod and skill, every mod's tests, every
# skill's structure and load, and the generated README blocks.
set -euo pipefail
shopt -s nullglob

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
failed=0

echo "== marketplace"
claude plugin validate --strict . || failed=1

for dir in mods/*/ skills/*/; do
  dir="${dir%/}"
  name="${dir#*/}"
  echo
  echo "== $dir"
  claude plugin validate --strict "$dir" || failed=1

  if [[ -f "$dir/hooks/hooks.json" ]]; then
    # A mod: its hooks module has tests that claude plugin test runs.
    if compgen -G "$dir/tests/*.test.ts" > /dev/null || compgen -G "$dir/tests/*.test.tsx" > /dev/null; then
      out="$(cd "$dir" && claude plugin test 2>&1)" && status=0 || status=$?
      echo "$out"
      if [[ $status -ne 0 ]]; then
        if grep -q "hooks modules are turned off in this process" <<<"$out"; then
          # The test runner refuses until a networked `claude` start has refreshed the mods switch.
          # Surface it loudly rather than fail a run that can't be fixed from inside CI.
          echo "::warning file=$dir::claude plugin test could not run here (mods switch not refreshed). Tests were NOT executed."
        else
          failed=1
        fi
      fi
    else
      echo "::warning file=$dir::no tests under $dir/tests/"
    fi
  elif [[ -d "$dir/skills" ]]; then
    # A skill: no hooks module, so claude plugin test refuses it. Check its files, then load it
    # and confirm Claude Code lists the skill. The token figures printed are estimates; nothing
    # asserts them.
    node scripts/check-skills.mjs "$dir" || failed=1
    out="$(claude --plugin-dir "$dir" plugin details "$name" 2>&1)" && status=0 || status=$?
    echo "$out"
    if [[ $status -ne 0 ]]; then
      echo "::error file=$dir::claude plugin details could not load $name"
      failed=1
    elif ! grep -Eq "^ *Skills \([1-9][0-9]*\).*\b$name\b" <<<"$out"; then
      echo "::error file=$dir::claude plugin details lists no skill named $name"
      failed=1
    fi
  else
    echo "::error file=$dir::neither a mod (hooks/hooks.json) nor a skill (skills/)"
    failed=1
  fi
done

echo
echo "== README table"
node scripts/update-readme.mjs --check || failed=1

echo
echo "== README hooks and calls blocks"
node scripts/sync-touches.mjs --check || failed=1

echo
if [[ $failed -ne 0 ]]; then
  echo "FAILED"
  exit 1
fi
echo "OK"
