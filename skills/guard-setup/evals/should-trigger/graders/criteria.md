---
type: llm
---

Judge only what the reply proposes, not the wording around it. PASS if all four are present:

1. A `/fence` command whose paths include src and tests (or equivalent source paths) and do not include migrations or dist.
2. At least one `/pin` command carrying a rule from the project's CLAUDE.md (use pnpm; never edit migrations; run the tests before saying done).
3. Proposed contents for `.claude/style-cop.md` with a `max-comment-ratio:` line and a `no-comments-in:` line that covers migrations or JSON files.
4. A `/red-green` command whose own command line runs the tests with pnpm (such as `/red-green pnpm test -- --run`), or `/red-green detect`.

The fence, pins, and red-green lines must be offered as commands for the user to run. A reply that also mentions npm or yarn elsewhere, for example in a pin saying not to use them, still passes.

FAIL if any of the four is missing, if the `/fence` paths include migrations or dist, if the `/red-green` command line itself runs npm or yarn, or if the reply says it has already set the fence, pins, or test command.
