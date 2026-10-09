import { expect, test } from 'claude-code/testing'

// Tests run with no session, sign-in, or network. Every $ call your mod makes
// needs a stub registered with on() before the test's first call on $.
// See https://code.claude.com/docs/en/plugins/mods/test

test('/alpha reports the tool calls the mod has seen', async ($, on) => {
  // Answer each tool call in Claude Code's place, so no tool runs.
  on('tool.call', () => ({ result: 'ok' }))

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Read', file_path: 'README.md' })

  const answer = await $.command.run({ command: 'alpha', args: '' })
  expect(answer.text).toBe('Claude has made 2 tool calls since this mod loaded')
})
