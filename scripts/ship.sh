#!/usr/bin/env bash
# Commit exactly one mod on its own branch, with only its own catalog row, README row,
# issue-form entry, and CODEOWNERS line, then optionally push and open a pull request.
# Other mods in the catalog that aren't committed yet are held back from the commit and
# restored to the working tree afterwards, so every commit validates on its own.
#
# Usage: scripts/ship.sh <name> "<pull request title>" [--pr]
#
#   On main, for a new mod, it creates the branch mod/<name> first. For an existing mod,
#   create fix/<name>-<topic> or feat/<name>-<topic> yourself. It never commits to main.
#   Without --pr it stops after the commit. With --pr it pushes the branch and opens a
#   pull request against main with gh.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
name="${1:?name}"; title="${2:?pull request title}"; mode="${3:-}"
export SHIP_NAME="$name"

if [[ ! -d "mods/$name" ]]; then
  echo "error: no such mod: mods/$name" >&2
  exit 2
fi

branch="$(git branch --show-current)"
if [[ "$branch" == "main" ]]; then
  if git ls-files --error-unmatch "mods/$name/.claude-plugin/plugin.json" >/dev/null 2>&1; then
    echo "error: mods/$name already exists on main. Create fix/$name-<topic> or feat/$name-<topic> and run this again." >&2
    exit 2
  fi
  branch="mod/$name"
  git switch -q -c "$branch"
  echo "created branch $branch"
fi

# The README table reads each mod's version from the working tree, so an uncommitted change
# to another tracked mod would be baked into this commit's README and fail CI. Refuse that.
dirty_others="$(git status --porcelain -- mods | awk '{print $2}' | cut -d/ -f2 | sort -u | grep -vx "$name" | while read -r m; do git ls-files --error-unmatch "mods/$m" >/dev/null 2>&1 && echo "$m"; done || true)"
if [[ -n "$dirty_others" ]]; then
  echo "error: uncommitted changes in already-committed mod(s): $dirty_others. Commit or stash those first." >&2
  exit 2
fi

# Mods present in the catalog whose directories git doesn't know yet, other than this one.
held="$(node -e '
const fs=require("node:fs"),cp=require("node:child_process")
const m=JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json","utf8"))
const tracked=cp.execSync("git ls-files mods",{encoding:"utf8"}).split("\n").filter(Boolean).map(p=>p.split("/")[1])
console.log(m.plugins.map(p=>p.name).filter(n=>n!==process.env.SHIP_NAME&&!tracked.includes(n)).join(" "))
')"

backup="$(mktemp -d)"
cp .claude-plugin/marketplace.json "$backup/catalog"
cp .github/CODEOWNERS "$backup/codeowners"
cleanup() {
  cp "$backup/catalog" .claude-plugin/marketplace.json
  cp "$backup/codeowners" .github/CODEOWNERS
  rm -rf "$backup"
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
const c=fs.readFileSync(".github/CODEOWNERS","utf8").split("\n").filter(l=>!held.some(h=>l.startsWith("/mods/"+h+"/"))).join("\n")
fs.writeFileSync(".github/CODEOWNERS",c)
'
fi
node scripts/update-readme.mjs >/dev/null
claude plugin validate --strict . >/dev/null
claude plugin validate --strict "mods/$name" >/dev/null

git add "mods/$name" .claude-plugin/marketplace.json README.md .github/CODEOWNERS .github/ISSUE_TEMPLATE docs/roadmap.md
git commit -q -m "$title"
echo "committed $name on $branch${held:+ (held back: $held)}"

if [[ "$mode" == "--pr" ]]; then
  git push -q -u origin "$branch"
  body="$(mktemp)"
  {
    echo "## Summary"
    echo
    node -p "require('./mods/$name/.claude-plugin/plugin.json').description"
    echo
    echo "What it touches, from \`claude plugin validate\`:"
    echo
    echo '```text'
    claude plugin validate "mods/$name" | sed -n 's/^ *❯ [^ ]* \(hooks: .*\)$/\1/p; s/^ *❯ [^ ]* \(calls: .*\)$/\1/p'
    echo '```'
    echo
    sed -n '/^## Type of change/,$p' .github/PULL_REQUEST_TEMPLATE.md
  } > "$body"
  gh pr create --base main --head "$branch" --title "$title" --body-file "$body"
  rm -f "$body"
else
  echo "next: git push -u origin $branch && gh pr create --base main --fill"
fi
