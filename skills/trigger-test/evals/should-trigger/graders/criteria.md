---
type: llm
---

Judge the final reply about why the csv-tidy skill never triggers. PASS if all of these hold:

1. It says the cause is the description: it doesn't use the words people type (such as CSV, clean, duplicates, dates) or it leads with history and a vague contents line instead of what the skill does and when to use it.
2. It shows the new description, which says what the skill does with CSV files and when to use it.
3. It says it wrote eval cases for `claude plugin eval`: at least one request that should trigger the skill and at least one nearby request that must not.
4. It gives the user a `claude plugin eval` command to run the cases.

FAIL if any of the four is missing, if it says it changed the skill's name or rewrote its body to make it trigger, or if it says it ran the evals.
