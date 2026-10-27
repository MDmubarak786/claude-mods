#!/usr/bin/env bash
# Writes a skill plugin whose description opens with history and a vague contents line and
# never says "CSV", "clean", "duplicates", or "dates": the words users type. The body says
# exactly what the skill does, so the fix is in the description alone.
set -euo pipefail
mkdir -p csv-tidy/.claude-plugin csv-tidy/skills/csv-tidy

cat > csv-tidy/.claude-plugin/plugin.json <<'EOF'
{ "name": "csv-tidy", "version": "0.1.0", "description": "Tabular data hygiene.", "author": { "name": "Example" }, "license": "MIT" }
EOF

cat > csv-tidy/skills/csv-tidy/SKILL.md <<'EOF'
---
name: csv-tidy
description: Utilities for tabular data hygiene, maintained by the data platform team since 2019. Covers several normalisation passes applied in a fixed order.
---

# csv-tidy

Clean a CSV file so it loads without surprises. Apply these passes in order, then write the result next to the original as `<name>.clean.csv` and summarise what changed.

1. Trim leading and trailing whitespace from every cell and header.
2. Normalise headers to lowercase snake_case and make them unique.
3. Remove exact duplicate rows, keeping the first.
4. Convert dates in any column to ISO 8601 (YYYY-MM-DD); leave a cell unchanged if it can't be parsed and list it.
5. Report rows whose column count differs from the header, without changing them.
EOF
