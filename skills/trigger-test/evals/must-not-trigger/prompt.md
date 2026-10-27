---
description: Writing a unit test for code, not testing whether a skill triggers. The skill must stay out of it.
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a pytest test for this function, covering an empty list and a list with negatives:

def total(xs): return sum(x for x in xs if x > 0)
