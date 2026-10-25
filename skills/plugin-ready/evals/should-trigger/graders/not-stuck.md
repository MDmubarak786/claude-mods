---
type: regex
target:
  source: file
  path: .claude-plugin/plugin.json
pattern: '"version"\s*:\s*"1\.2\.3"'
match: not_contains
---
