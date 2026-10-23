#!/usr/bin/env bash
# Start Claude Code with one or more mods or skills loaded for this session only.
# Usage: scripts/try.sh <name> [<name>...] [-- extra claude args]
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --) shift; break ;;
    *)
      if [[ -d "$root/mods/$1" ]]; then
        args+=(--plugin-dir "$root/mods/$1")
      elif [[ -d "$root/skills/$1" ]]; then
        args+=(--plugin-dir "$root/skills/$1")
      else
        echo "error: no such mod or skill: $1" >&2
        exit 2
      fi
      shift
      ;;
  esac
done
if [[ ${#args[@]} -eq 0 ]]; then
  echo "usage: scripts/try.sh <name> [<name>...] [-- extra claude args]" >&2
  exit 2
fi
exec claude "${args[@]}" "$@"
