<!--
Title format. It becomes the commit subject on main when the pull request is squash-merged:
  Add <name>: <what it does>               a new mod
  <name> <new version>: <what changed>     a change to one mod
  docs: ...   ci: ...   chore: ...         everything else

Branch names: mod/<name>, fix/<name>-<topic>, feat/<name>-<topic>, docs/<topic>, ci/<topic>, chore/<topic>.
See CONTRIBUTING.md for the whole flow.
-->

## Summary

<!-- What changes and why, in two or three sentences. For a new mod: the pain it removes and what the user sees. -->

Closes #

## Type of change

- [ ] New mod
- [ ] Fix to an existing mod
- [ ] Improvement to an existing mod
- [ ] Docs or templates only
- [ ] Scripts, CI, or repository settings

## Mod checklist

<!-- Skip this section if no mod changes. -->

- [ ] One mod per pull request
- [ ] `scripts/validate.sh` passes locally: strict validation, tests, the README table, and the touches blocks
- [ ] Tests cover the event the change is about: the deny, the rewrite, or the command's reply
- [ ] The README's **What it touches** block matches `claude plugin validate` (`node scripts/sync-touches.mjs` pastes it)
- [ ] The README's **Tested with** names the `claude --version` and the surface you tested on
- [ ] Existing mod: `version` in its `plugin.json` is bumped
- [ ] New mod: a line in `.github/CODEOWNERS`, and `category` and `tags` in its catalog entry

## Safety

- [ ] The mod does nothing listed under **What a merged mod must not do** in [SECURITY.md](https://github.com/MDmubarak786/claude-mods/blob/main/SECURITY.md), or its README explains the exception
- [ ] Every `$.process.run`, `$.http.fetch`, `$.prompt.submit`, `$.env`, and `tool.check` use is explained in the README
- [ ] Every hook that can refuse something fails closed in its `.catch`

## How it was tested

<!-- The commands you ran and what you saw. Say which parts ran only under `claude plugin test` and which you saw in a real session. -->

## Screenshot or recording

<!-- Required if the mod draws anything. Put files in mods/<name>/screenshots/. -->
