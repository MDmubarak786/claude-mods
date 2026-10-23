#!/usr/bin/env bash
# Writes the fixture project the should-trigger prompt asks about. Run by `claude plugin eval --scaffold`
# in the empty workspace of each run. A small pnpm project with source, tests, migrations, a generated
# dist folder, and a CLAUDE.md that already states two rules the pins should pick up.
set -euo pipefail
mkdir -p src tests migrations dist .github/workflows

cat > package.json <<'EOF'
{
  "name": "ledger-api",
  "version": "1.4.0",
  "private": true,
  "scripts": {
    "test": "vitest",
    "build": "tsc -p tsconfig.json",
    "migrate": "node scripts/migrate.js"
  },
  "devDependencies": { "vitest": "^3.0.0", "typescript": "^5.6.0" }
}
EOF
echo "lockfileVersion: '9.0'" > pnpm-lock.yaml
printf 'node_modules/\ndist/\ncoverage/\n.env\n' > .gitignore

cat > CLAUDE.md <<'EOF'
# ledger-api

- Use pnpm, never npm or yarn.
- Never edit files under migrations/; add a new migration instead.
- Run the tests before saying a change is done.
- Keep comments to what the code can't say. No commented-out code.
EOF

cat > src/ledger.ts <<'EOF'
export function balance(entries: number[]): number {
  return entries.reduce((sum, n) => sum + n, 0)
}
EOF
cat > tests/ledger.test.ts <<'EOF'
import { expect, test } from 'vitest'
import { balance } from '../src/ledger'
test('sums entries', () => { expect(balance([1, 2, 3])).toBe(6) })
EOF
cat > migrations/0001_create_entries.sql <<'EOF'
create table entries (id serial primary key, amount integer not null);
EOF
echo "export function balance(e){return e.reduce((s,n)=>s+n,0)}" > dist/ledger.js

cat > .github/workflows/ci.yml <<'EOF'
name: ci
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: corepack enable && pnpm install --frozen-lockfile
      - run: pnpm test -- --run
EOF
