#!/usr/bin/env bash
# Writes a bloated skill plugin for the should-trigger case, modelled on the issues the roadmap cites:
# a description that buries its trigger, a SKILL.md with all 24 rules inline, and a line sending
# Claude to AGENTS.md, which repeats every rule at greater length. Rule IDs R01 to R24 let a
# grader and the coverage check find each rule after the restructure.
set -euo pipefail
skill=react-rules/skills/react-rules
mkdir -p react-rules/.claude-plugin "$skill"

cat > react-rules/.claude-plugin/plugin.json <<'EOF'
{ "name": "react-rules", "version": "1.0.0", "description": "React performance rules.", "author": { "name": "Example" }, "license": "MIT" }
EOF

topics=(rendering rendering rendering rendering rendering rendering data data data data data data bundle bundle bundle bundle bundle bundle state state state state state state)
titles=(
  "Memoize expensive child components only when profiling shows wasted renders"
  "Give list items stable keys from the data, never the array index"
  "Keep inline object and array props out of hot render paths"
  "Split context providers so one value change doesn't re-render every consumer"
  "Virtualize lists longer than a few hundred rows"
  "Derive values during render instead of syncing them with an effect"
  "Fetch on the server when the data doesn't depend on the client"
  "Start independent requests in parallel, not in a waterfall"
  "Show a loading state per region, not one spinner for the page"
  "Cache GET requests with a stale-while-revalidate policy"
  "Cancel in-flight requests when the component unmounts"
  "Never fetch inside a loop over rendered items"
  "Import from a module's own path, not from a barrel file"
  "Lazy-load routes and heavy widgets with dynamic import"
  "Keep date and number formatting libraries out of the main bundle"
  "Prefer CSS for animations a library would ship JavaScript for"
  "Check the bundle analyzer before adding a dependency over 20 KB"
  "Ship modern syntax to modern browsers; don't transpile for IE"
  "Keep state as close as possible to where it is used"
  "Store the minimal state and derive the rest"
  "Use a reducer when the next state depends on several fields"
  "Don't mirror server data in client state; read it from the cache"
  "Batch related state updates into one setter call"
  "Reset state with a key change instead of an effect"
)

desc="This comprehensive collection of React guidance has been maintained over many years by experienced engineers and reflects lessons learned across hundreds of production applications, large and small. It covers twenty-four rules spanning rendering behaviour, data fetching strategy, bundle size management, and state design, each with a rationale, a bad example, and a good example, and it links to a complete expanded guide for readers who want every detail in one place. The rules are opinionated but battle-tested, and they apply equally to client-side applications, server-rendered applications, and hybrid frameworks. Use when writing, reviewing, or refactoring React components for performance."

{
  printf -- '---\nname: react-rules\ndescription: %s\n---\n\n' "$desc"
  printf '# React rules\n\nApply these rules when writing or reviewing React code. For the complete guide with all rules expanded, read AGENTS.md before starting any task.\n\n'
  for i in "${!titles[@]}"; do
    id=$(printf 'R%02d' $((i + 1)))
    printf '## %s %s\n\n' "$id" "${titles[$i]}"
    printf 'Topic: %s. %s. Teams that skip this rule see slower interactions, more re-renders, larger downloads, or harder-to-follow state, depending on the app. Apply it by default and depart from it only with a measurement that shows the exception is worth it.\n\n' "${topics[$i]}" "${titles[$i]}"
    printf 'Bad:\n\n```tsx\n// %s: violates the rule\nexport function Example() { return null }\n```\n\nGood:\n\n```tsx\n// %s: follows the rule\nexport function Example() { return null }\n```\n\n' "$id" "$id"
  done
} > "$skill/SKILL.md"

{
  printf '# React rules: the complete guide\n\nEvery rule, expanded. This file repeats SKILL.md with more detail.\n\n'
  for i in "${!titles[@]}"; do
    id=$(printf 'R%02d' $((i + 1)))
    printf '## %s %s\n\n' "$id" "${titles[$i]}"
    printf 'Topic: %s.\n\n%s. This rule exists because the cost it prevents compounds: one violation is cheap, but a codebase that ignores it everywhere becomes slow in ways no single change explains. Profile first, then apply the rule where the profile shows the cost.\n\n' "${topics[$i]}" "${titles[$i]}"
    printf 'Why it matters: users notice the difference on slower devices first, and those are the users with the least patience for it. The rule keeps the common path fast without hand-tuning each component.\n\n'
    printf 'Bad:\n\n```tsx\n// %s: violates the rule\nexport function Example() { return null }\n```\n\nGood:\n\n```tsx\n// %s: follows the rule\nexport function Example() { return null }\n```\n\nSee also the related rules in the same topic.\n\n' "$id" "$id"
  done
} > "$skill/AGENTS.md"
