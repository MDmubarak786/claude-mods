#!/usr/bin/env bash
# Everything CI checks: marketplace manifest, every mod, every mod's tests, and the README table.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
failed=0

echo "== marketplace"
claude plugin validate --strict . || failed=1

for mod in mods/*/; do
  mod="${mod%/}"
  echo
  echo "== $mod"
  claude plugin validate --strict "$mod" || failed=1

  if compgen -G "$mod/tests/*.test.ts" > /dev/null || compgen -G "$mod/tests/*.test.tsx" > /dev/null; then
    out="$(cd "$mod" && claude plugin test 2>&1)" && status=0 || status=$?
    echo "$out"
    if [[ $status -ne 0 ]]; then
      if grep -q "hooks modules are turned off in this process" <<<"$out"; then
        # The test runner refuses until a networked `claude` start has refreshed the mods switch.
        # Surface it loudly rather than fail a run that can't be fixed from inside CI.
        echo "::warning file=$mod::claude plugin test could not run here (mods switch not refreshed). Tests were NOT executed."
      else
        failed=1
      fi
    fi
  else
    echo "::warning file=$mod::no tests under $mod/tests/"
  fi
done

echo
echo "== README table"
node scripts/update-readme.mjs --check || failed=1

echo
echo "== README hooks and calls blocks"
node scripts/sync-touches.mjs --check || failed=1

echo
echo "== bingo square table"
node scripts/sync-squares.mjs --check || failed=1

echo
if [[ $failed -ne 0 ]]; then
  echo "FAILED"
  exit 1
fi
echo "OK"
