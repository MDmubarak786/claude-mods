---
type: llm
---

Judge the final reply about slimming the react-rules skill. PASS if all of these hold:

1. It reports a before and an after size for the skill, as tokens (estimated is fine) or lines, and the after is smaller.
2. It says the skill no longer sends Claude to the whole AGENTS.md guide on every run (the link is removed, or AGENTS.md is split or deleted).
3. It names the new reference files or the new layout (for example, files by topic such as rendering, data, bundle, state).
4. It says all 24 rules (R01 to R24) are still present after the change, from a check it ran, not as an assumption.

FAIL if any of the four is missing, if it says any rule was removed, merged away, or reworded on purpose, or if it only proposes changes without applying them.
