---
type: llm
---

Judge the final reply about making the sam-skills repository installable and updatable. PASS if all of these hold:

1. It says why users were stuck: the version in plugin.json was pinned at 1.2.3 and never changed after the skills were edited, so Claude Code saw no new version. And it fixes that, either by bumping the version or by removing it so commits are tracked.
2. It gives the install commands for users, a `/plugin marketplace add sam-lee/sam-skills` line and a `/plugin install <plugin>@<marketplace>` line.
3. It says what the author must do from now on so updates keep reaching users: bump the version with every release (optionally with a check that enforces it), or rely on commits if it removed the version. Telling users how to get updates (auto-update or `/plugin marketplace update`) also counts toward this point but is not required.
4. It flags that the code-review skill shares its name with Claude Code's built-in `/code-review` command.

FAIL if any of the four is missing, or if it says it renamed the code-review skill without being asked.
