# pkg-guard

Hold `npm`, `pnpm`, `yarn`, `bun`, `pip`, `uv`, and `cargo` installs of packages that don't exist, were published in the last 30 days, or have fewer than about 100 downloads a week. The question shows the registry facts; the default answer is refuse.

The threat is specific to coding agents: a model infers a package name that sounds right, and typosquatters register exactly those names. A package already in your lockfile is never questioned, so day-to-day installs don't change.

## Install

```text
/plugin marketplace add MDmubarak786/claude-mods
/plugin install pkg-guard@modhub
```

Try it for one session without installing:

```bash
claude --plugin-dir ./mods/pkg-guard
```

## Use it

When Claude runs an install for a package that isn't in the project's lockfile, the mod looks it up:

| Registry | Looked up | Facts shown |
| :-- | :-- | :-- |
| npm (`npm i`, `pnpm add`, `yarn add`, `bun add`) | `registry.npmjs.org`, `api.npmjs.org` | first publish date, weekly downloads, repository |
| PyPI (`pip install`, `uv add`, `uv pip install`) | `pypi.org`, `pypistats.org` | first upload date, weekly downloads, source URL |
| crates.io (`cargo add`) | `crates.io` | creation date, recent downloads |

A package installed from a URL, a git repository, a tarball, or a custom index can't be checked against a registry, so it is held too; a local path is not. An npm alias (`name@npm:target`) is checked by its target. Installs behind `sudo`, environment assignments, `python -m pip`, a pipe, or a `$(...)` substitution are all seen.

An established package installs silently; `/pkg-guard` lists what was checked. A suspect one opens Claude Code's question dialog:

```text
pkg-guard: npm package "left-padd" does not exist on the registry. Install anyway?
  1. Refuse
  2. Install
```

On refuse, Claude reads the facts and is told to check the exact name on the registry, prefer a well-known package, or ask you. Lookups are cached for a day.

| Command | What it does |
| :-- | :-- |
| `/pkg-guard` | Show whether it's on and what was checked this session. |
| `/pkg-guard off` | Let every install through. Remembered across sessions. |
| `/pkg-guard on` | Turn it back on. |

## What it touches

From `claude plugin validate ./mods/pkg-guard`:

```text
hooks: session.start, command.run{command=pkg-guard}, tool.call{tool=Bash}
calls: $.command.register, $.fs.exists (via inLockfile), $.fs.read (via inLockfile), $.http.fetch (via lookup), $.store.get, $.store.set, $.ui.ask, $.ui.log
```

- **`$.http.fetch`** sends only the package name to the public registries listed above, over HTTPS, and only for a package that isn't in your lockfile. Nothing else leaves the machine.
- **`$.fs.read`** reads lockfiles in the working directory to skip known packages. A lockfile vouches for a package only when it lists that exact name in the file's own syntax, never when the name appears as a substring of another package or in a comment.
- **`$.store`** keeps a day's cache of registry answers and the on/off flag.

**Failure policy.** This is a guard, so if the registry can't be reached or the hook fails, an install is refused with a reason rather than let through.

## Tested with

- Claude Code 2.1.295, `claude plugin validate --strict` and `claude plugin test` pass against a fake registry. `/pkg-guard` answered from a live `claude -p` session. Live registry lookups haven't been exercised by the author in a session yet.

## Limitations

- Under `claude -p`, nobody can answer the question, so every suspect install is refused. That's the safe default, and the reason is in Claude's result.
- Only direct install commands are parsed. A package added by editing `package.json` and running a bare `npm install` isn't checked, because the bare install has no name to check.
- The thresholds (30 days, 100 downloads a week) are fixed in this version.
- Download counts come from the registries' public stats and lag a day or two.

## License

MIT, see the repository root.
