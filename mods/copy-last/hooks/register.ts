// copy-last: copy Claude's last reply, or its last code block, to the clipboard.
//
//   /copy            the last reply, as Markdown source
//   /copy code       the last fenced code block in the last reply
//   /copy code 2     the second-to-last code block
//
// Copying from the terminal picks up gutter indentation and trailing spaces.
// This reads the reply from the transcript and copies the source text.

const FENCE = /```[^\n]*\n([\s\S]*?)```/g

function codeBlocks(text: string): string[] {
  const blocks: string[] = []
  for (const match of text.matchAll(FENCE)) blocks.push(match[1].replace(/\n$/, ''))
  return blocks
}

async function lastReplies($, count: number): Promise<string[]> {
  const messages = await $.session.messages()
  const replies: string[] = []
  for (let i = messages.length - 1; i >= 0 && replies.length < count; i--) {
    const m = messages[i]
    if (m.role === 'assistant' && typeof m.text === 'string' && m.text.trim()) replies.push(m.text)
  }
  return replies
}

function describe(text: string): string {
  const lines = text.split('\n').length
  return text.length + ' characters, ' + lines + (lines === 1 ? ' line' : ' lines')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'copy',
        description: 'Copy the last reply, or its last code block, as clean text',
        argumentHint: '[code [N]]',
      })
    } catch (error) {
      $.ui.log('could not register /copy: ' + error)
    }
    return next(e)
  })

  on('command.run', { command: 'copy' }, async ($, e) => {
    const args = e.args.trim().split(/\s+/).filter(Boolean)
    const wantCode = args[0] === 'code'
    const nth = wantCode && args[1] ? Number(args[1]) : 1
    if (wantCode && (!Number.isInteger(nth) || nth < 1)) return { text: 'Usage: /copy, /copy code, or /copy code N' }

    // Look back through a few replies so a block in the previous reply is still reachable.
    const replies = await lastReplies($, wantCode ? 5 : 1)
    if (replies.length === 0) return { text: 'Nothing to copy yet.' }

    let text = replies[0]
    if (wantCode) {
      const blocks = replies.flatMap((reply) => codeBlocks(reply).reverse())
      if (blocks.length === 0) return { text: 'No code block in the last replies.' }
      if (nth > blocks.length) return { text: 'Only ' + blocks.length + ' code block(s) found.' }
      text = blocks[nth - 1]
    }

    const copied = await $.ui.copy({ text })
    if (!copied.isCopied) return { text: 'Could not copy to the clipboard.' }
    return { text: 'Copied ' + (wantCode ? 'code block: ' : 'reply: ') + describe(text) }
  }).catch(async () => ({ text: 'copy-last: the command failed, so nothing was copied.' }))
}
