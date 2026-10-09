#!/usr/bin/env bash
# Start Claude Code with one or more mods loaded for this session only.
# Usage: scripts/try.sh <name> [<name>...] [-- extra claude args]
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --) shift; break ;;
    *)
      if [[ ! -d "$root/mods/$1" ]]; then
        echo "error: no such mod: mods/$1" >&2
        exit 2
      fi
      args+=(--plugin-dir "$root/mods/$1")
      shift
      ;;
  esac
done
if [[ ${#args[@]} -eq 0 ]]; then
  echo "usage: scripts/try.sh <name> [<name>...] [-- extra claude args]" >&2
  exit 2
fi
exec claude "${args[@]}" "$@"
