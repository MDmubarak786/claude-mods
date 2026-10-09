#!/usr/bin/env bash
# Commit and push exactly one mod, with only its own catalog row, README row, and CODEOWNERS line.
# Other mods that are in the catalog but not yet committed are held back from this commit and
# restored to the working tree afterwards, so every pushed commit validates on its own.
# Usage: scripts/ship.sh <name> "<commit message>" [--no-push]
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
name="${1:?name}"; message="${2:?message}"; push="${3:-}"
export SHIP_NAME="$name"

# The README table reads each mod's version from the working tree, so an uncommitted change
# to another tracked mod would be baked into this commit's README and fail CI. Refuse that.
dirty_others="$(git status --porcelain -- mods | awk '{print $2}' | cut -d/ -f2 | sort -u | grep -vx "$name" | while read -r m; do git ls-files --error-unmatch "mods/$m" >/dev/null 2>&1 && echo "$m"; done || true)"
if [[ -n "$dirty_others" ]]; then
  echo "error: uncommitted changes in already-shipped mod(s): $dirty_others. Ship or stash those first." >&2
  exit 2
fi

# Mods present in the catalog whose directories git doesn't know yet, other than this one.
held="$(node -e '
const fs=require("node:fs"),cp=require("node:child_process")
const m=JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json","utf8"))
const tracked=cp.execSync("git ls-files mods",{encoding:"utf8"}).split("\n").filter(Boolean).map(p=>p.split("/")[1])
console.log(m.plugins.map(p=>p.name).filter(n=>n!==process.env.SHIP_NAME&&!tracked.includes(n)).join(" "))
')"

cp .claude-plugin/marketplace.json "$root/.ship-catalog.bak"
cp .github/CODEOWNERS "$root/.ship-codeowners.bak"
cleanup() {
  mv "$root/.ship-catalog.bak" .claude-plugin/marketplace.json
  mv "$root/.ship-codeowners.bak" .github/CODEOWNERS
  node scripts/update-readme.mjs >/dev/null
}
trap cleanup EXIT

if [[ -n "$held" ]]; then
  HELD="$held" node -e '
const fs=require("node:fs")
const held=process.env.HELD.split(" ")
const f=".claude-plugin/marketplace.json"
const m=JSON.parse(fs.readFileSync(f,"utf8"))
m.plugins=m.plugins.filter(p=>!held.includes(p.name))
fs.writeFileSync(f,JSON.stringify(m,null,2)+"\n")
let c=fs.readFileSync(".github/CODEOWNERS","utf8").split("\n").filter(l=>!held.some(h=>l.startsWith("/mods/"+h+"/"))).join("\n")
fs.writeFileSync(".github/CODEOWNERS",c)
'
fi
node scripts/update-readme.mjs >/dev/null
claude plugin validate --strict . >/dev/null

git add "mods/$name" .claude-plugin/marketplace.json README.md .github/CODEOWNERS docs/roadmap.md scripts
git commit -q -m "$message"
echo "committed $name${held:+ (held back: $held)}"
if [[ "$push" != "--no-push" ]]; then
  GIT_SSH_COMMAND="ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519_personal" git push -q origin main
  echo "pushed $name"
fi
