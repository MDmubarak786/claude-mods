#!/usr/bin/env bash
# Thin wrapper over the two Claude Code commands that install a mod from this marketplace.
# Usage: scripts/install.sh <name> [<name>...]          install from GitHub
#        scripts/install.sh --local <name> [<name>...]  install from this clone
#
# There is deliberately no `curl | bash` here. Mods run with your permissions; read
# the README's "Is this safe?" section and run `claude plugin validate` first.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
marketplace="$(node -p "require('$root/.claude-plugin/marketplace.json').name")"
source_spec="MDmubarak786/claude-mods"

if [[ "${1:-}" == "--local" ]]; then
  source_spec="$root"
  shift
fi
if [[ $# -eq 0 ]]; then
  echo "usage: scripts/install.sh [--local] <name> [<name>...]" >&2
  exit 2
fi

if ! claude plugin marketplace list 2>/dev/null | grep -q "$marketplace"; then
  claude plugin marketplace add "$source_spec"
fi
for name in "$@"; do
  claude plugin install "$name@$marketplace" --scope user
done
echo "Done. Run /reload-plugins in any session that is already open."
