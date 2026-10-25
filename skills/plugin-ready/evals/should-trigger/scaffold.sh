#!/usr/bin/env bash
# Writes the skills repository the should-trigger prompt asks about, as a git repository with
# two commits: the first pins version 1.2.3, the second edits two skills without bumping it.
# There is no marketplace.json, one skill is named code-review like the built-in command, and
# the README tells people to copy skills into ~/.claude/skills.
set -euo pipefail
git init -q -b main .
git config user.email sam@example.com
git config user.name "Sam Lee"
git remote add origin https://github.com/sam-lee/sam-skills.git
mkdir -p .claude-plugin skills/grill-me skills/code-review skills/write-prd

cat > .claude-plugin/plugin.json <<'EOF'
{
  "name": "sam-skills",
  "version": "1.2.3",
  "description": "Skills for planning and reviewing work.",
  "author": { "name": "Sam Lee" },
  "license": "MIT"
}
EOF

cat > skills/grill-me/SKILL.md <<'EOF'
---
name: grill-me
description: Interview the user about a plan until it is clear. Use when the user says grill me or wants a plan stress-tested.
---

Ask one question at a time about the plan until every decision is made. Stop at ten questions.
EOF

cat > skills/code-review/SKILL.md <<'EOF'
---
name: code-review
description: Review the current diff for bugs and unclear code. Use when the user asks for a code review.
---

Read the diff. List bugs first, then unclear names, then missing tests. Quote each line you flag.
EOF

cat > skills/write-prd/SKILL.md <<'EOF'
---
name: write-prd
description: Turn a conversation into a product requirements document. Use when the user asks for a PRD or spec.
---

Write the PRD with problem, users, goals, non-goals, requirements, and open questions.
EOF

cat > README.md <<'EOF'
# sam-skills

Skills for planning and reviewing work: grill-me, code-review, write-prd.

## Install

Copy the folders under `skills/` into `~/.claude/skills/`.
EOF

git add -A
git commit -q -m "sam-skills 1.2.3"

printf '\nStop at seven questions, not ten, and summarise the decisions at the end.\n' >> skills/grill-me/SKILL.md
printf '\nAlso flag any function longer than 50 lines.\n' >> skills/code-review/SKILL.md
git commit -q -am "Tighten grill-me and code-review"
