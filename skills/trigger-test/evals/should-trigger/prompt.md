---
description: A skill plugin written by scaffold.sh whose description never says what users ask for. The user wants it fixed and tested, approves edits up front, and will run the evals themselves, so the run writes files and the files can be graded.
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Write, Edit, Skill]
---

I wrote a skill called csv-tidy (it's in the csv-tidy folder here), but it never kicks in when I ask Claude to clean up a CSV. Work out why, fix it, and write tests that show whether it fires. You can edit the files. Don't run anything, I'll run the tests myself, just tell me the command.
