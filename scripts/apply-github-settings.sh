#!/usr/bin/env bash
# Apply this repository's GitHub settings: merge options, topics, labels, private
# vulnerability reporting, Discussions, and branch protection on main. Idempotent.
# Needs admin rights on the repository and an authenticated gh. docs/maintaining.md
# explains each setting; change it here and rerun rather than in the GitHub UI.
# Usage: scripts/apply-github-settings.sh [owner/repo]
set -euo pipefail
repo="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
echo "Applying settings to $repo"

gh api -X PATCH "repos/$repo" --silent \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -F allow_update_branch=true -F has_discussions=true \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=COMMIT_MESSAGES
echo "  merging: squash only, titled from the pull request, branch deleted after merge"
echo "  discussions: on"

gh api -X PUT "repos/$repo/topics" --silent --input - <<'JSON'
{ "names": ["claude-code", "claude-code-mods", "claude-code-mod", "claude-code-plugins", "claude", "ai-coding", "developer-tools", "typescript"] }
JSON
echo "  topics: set"

gh api -X PUT "repos/$repo/private-vulnerability-reporting" --silent
echo "  private vulnerability reporting: on"

while IFS='|' read -r label color description; do
  gh label create "$label" --repo "$repo" --color "$color" --description "$description" --force >/dev/null
done <<'LABELS'
bug|d73a4a|A mod does the wrong thing, or nothing
enhancement|a2eeef|An improvement to an existing mod
idea|c5def5|A proposal for a new mod
new-mod|0e8a16|A pull request that adds a mod
mod|bfdadc|Touches a mod under mods/
documentation|0075ca|READMEs, docs, or templates
ci|5319e7|Workflows and scripts
security|b60205|A mod reaches further than it should
needs-triage|fbca04|Not looked at by a maintainer yet
dependencies|0366d6|Dependency updates
breaking|e11d21|Changes what an installed mod does in a way users will notice
good first issue|7057ff|Small and well-scoped
help wanted|008672|Maintainers would welcome a pull request
LABELS
echo "  labels: synced"

gh api -X PUT "repos/$repo/branches/main/protection" --silent --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "checks": [{ "context": "validate" }] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "block_creations": false,
  "lock_branch": false
}
JSON
echo "  main: protected (PR + code-owner review, validate check up to date, linear history, no force push)"
