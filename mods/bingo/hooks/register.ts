// bingo: tool-call bingo. A daily 5×5 card of things Claude does, filled in
// by itself as Claude works.
//
//   /bingo          open the card in a pane (prints it where no pane can draw)
//   /bingo card     print the card as text
//   /bingo new      reshuffle today's card
//   /bingo loud     toast every square as it fills; /bingo quiet for lines only
//   /bingo stats    cards played, lines completed, blackouts
//
// Every session on the machine draws the same card for the day, from the date,
// and marks are shared through the store, so a line can be finished across
// sessions. Only the main conversation is watched; a subagent's work counts as
// one square, "subagent". Nothing here calls a model or leaves the machine.

import { atom, read, update } from 'claude-code'
import type { Game, Stats } from '../types'
import { CARD_SIZE, FREE, SQUARES, completedLines, dayOf, drawCard, emptyTurn, idAt, isMarked, labelOf, noteToolInTurn, squaresForTool, squaresForTurn } from './squares'
import type { TurnStats } from './squares'

const PANE = 'bingo'
const KEEP_DAYS = 14
const EMPTY_STATS: Stats = { cards: 0, lines: 0, blackouts: 0 }
const EMPTY: Game = { date: '', ids: [], salt: 0, marks: {}, loud: false, stats: EMPTY_STATS }
const game = atom({ plugin: 'bingo', key: 'game' } as const, EMPTY)

// The main conversation's current turn. Subagents are ignored.
let turn: TurnStats = emptyTurn()

type SavedCard = { ids: string[]; salt: number; marks: Record<string, number> }

function savedCard(x: unknown): SavedCard | null {
  if (!x || typeof x !== 'object') return null
  const c = x as Record<string, unknown>
  if (!Array.isArray(c.ids) || c.ids.length !== CARD_SIZE || !c.ids.every((id) => typeof id === 'string')) return null
  return { ids: c.ids as string[], salt: typeof c.salt === 'number' ? c.salt : 0, marks: c.marks && typeof c.marks === 'object' ? (c.marks as Record<string, number>) : {} }
}

async function savedStats($): Promise<Stats> {
  try {
    const s = await $.store.get('stats')
    if (s && typeof s === 'object') return { cards: Number(s.cards) || 0, lines: Number(s.lines) || 0, blackouts: Number(s.blackouts) || 0 }
  } catch {
    // Fresh stats.
  }
  return EMPTY_STATS
}

// Load today's card from the store, drawing a new one if the day has none.
async function load($, fresh = false) {
  const now = await $.clock.now()
  const date = dayOf(now)
  const key = 'card:' + date
  let card: SavedCard | null = null
  let stats = await savedStats($)
  let loud = false
  try {
    loud = (await $.store.get('loud')) === true
    if (!fresh) card = savedCard(await $.store.get(key))
    if (fresh) {
      const old = savedCard(await $.store.get(key))
      card = { ids: drawCard(date, (old?.salt ?? 0) + 1), salt: (old?.salt ?? 0) + 1, marks: {} }
    }
    if (!card) card = { ids: drawCard(date, 0), salt: 0, marks: {} }
    if (fresh || !(await $.store.get(key))) {
      stats = { ...stats, cards: stats.cards + 1 }
      await $.store.set('stats', stats)
    }
    await $.store.set(key, card)
  } catch {
    if (!card) card = { ids: drawCard(date, 0), salt: 0, marks: {} }
  }
  await update($, game, () => ({ date, ids: card!.ids, salt: card!.salt, marks: card!.marks, loud, stats }))
}

async function prune($) {
  const cutoff = dayOf((await $.clock.now()) - KEEP_DAYS * 86400000)
  try {
    for (const key of await $.store.keys()) {
      const m = /^card:(\d{4}-\d{2}-\d{2})$/.exec(key)
      if (m && m[1] < cutoff) await $.store.delete(key)
    }
  } catch {
    // Best effort.
  }
}

// Mark squares that are on the card and not yet marked. Marks from other
// sessions are merged in from the store before writing.
async function mark($, ids: string[]) {
  if (!ids.length) return
  let g = await read($, game)
  if (!g.ids.length) return
  const now = await $.clock.now()
  // A new day started mid-session: switch to its card first.
  if (dayOf(now) !== g.date) {
    await load($)
    g = await read($, game)
  }
  const fresh = ids.filter((id) => g.ids.includes(id) && !(id in g.marks))
  if (!fresh.length) return

  let marks = { ...g.marks }
  try {
    const saved = savedCard(await $.store.get('card:' + g.date))
    if (saved && saved.salt === g.salt) marks = { ...saved.marks, ...marks }
  } catch {
    // Merge is best effort.
  }
  const before = completedLines(g.ids, marks)
  for (const id of fresh) marks[id] = now
  const after = completedLines(g.ids, marks)
  const newLines = after.filter((l) => !before.includes(l))
  const blackout = g.ids.every((id) => id in marks) && !g.ids.every((id) => id in g.marks)
  const stats = { ...g.stats, lines: g.stats.lines + newLines.length, blackouts: g.stats.blackouts + (blackout ? 1 : 0) }

  try {
    await $.store.set('card:' + g.date, { ids: g.ids, salt: g.salt, marks })
    if (newLines.length || blackout) await $.store.set('stats', stats)
  } catch {
    // The drawing still updates; the store catches up on the next mark.
  }
  await update($, game, (v) => ({ ...v, marks, stats }))

  if (g.loud) for (const id of fresh) $.ui.toast('bingo: ' + labelOf(id))
  for (const line of newLines) $.ui.toast('BINGO! ' + line + ' is complete.', { timeoutMs: 6000 })
  if (blackout) $.ui.toast('BLACKOUT! Every square on today\'s card is marked.', { timeoutMs: 8000 })
}

function cardText(g: Game): string {
  const cell = (pos: number) => {
    const id = idAt(g.ids, pos)
    const label = id === null ? 'FREE' : labelOf(id)
    return (isMarked(g.ids, g.marks, pos) ? '[x] ' : '[ ] ') + label.padEnd(12)
  }
  const rows = [0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => cell(r * 5 + c)).join(' '))
  const marked = g.ids.filter((id) => id in g.marks).length
  const lines = completedLines(g.ids, g.marks)
  return ['Bingo for ' + g.date + ' · ' + marked + '/' + CARD_SIZE + ' marked · ' + lines.length + ' line' + (lines.length === 1 ? '' : 's') + (lines.length ? ' (' + lines.join(', ') + ')' : ''), ...rows].join('\n')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await load($)
    await prune($)
    try {
      await $.command.register({ name: 'bingo', description: 'Tool-call bingo: a daily card of things Claude does', argumentHint: '[card | new | loud | quiet | stats]', immediate: true })
    } catch (error) {
      $.ui.log('could not register /bingo: ' + error)
    }
    return next(e)
  })

  // /clear and /resume reset $.state; load the day's card again.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await load($)
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('command.run', { command: 'bingo' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'card') return { text: cardText(await read($, game)) }
    if (args === 'new') {
      await load($, true)
      return { text: 'New card for today.\n' + cardText(await read($, game)) }
    }
    if (args === 'loud' || args === 'quiet') {
      const loud = args === 'loud'
      await $.store.set('loud', loud)
      await update($, game, (v) => ({ ...v, loud }))
      return { text: loud ? 'Loud: every square toasts as it fills.' : 'Quiet: only completed lines toast.' }
    }
    if (args === 'stats') {
      const s = (await read($, game)).stats
      return { text: 'Cards played ' + s.cards + ' · lines completed ' + s.lines + ' · blackouts ' + s.blackouts }
    }
    if (args) return { text: 'Usage: /bingo, /bingo card, /bingo new, /bingo loud, /bingo quiet, or /bingo stats' }
    const placed = await $.ui.open({ id: PANE, title: 'Bingo', focus: true, closeOnEscape: true, rows: 24 })
    if (!placed.isPlaced) return { text: cardText(await read($, game)) }
    return {}
  }).catch(async () => ({ text: 'bingo: the command failed.' }))

  // Your own slash commands count, apart from /bingo itself.
  on('command.run', async ($, e, next) => {
    if (e.command !== 'bingo' && e.origin && e.origin.kind === 'composer') await mark($, ['slash'])
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (typeof e.agentId !== 'string') turn = emptyTurn()
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (typeof e.agentId !== 'string') {
      try {
        const { tool, ...input } = e
        noteToolInTurn(turn, tool, input)
        await mark($, squaresForTool(tool, input, result ?? {}))
      } catch {
        // A square that can't be judged is skipped; the call is unaffected.
      }
    }
    return result
  }).catch(async ($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (typeof e.agentId !== 'string') {
      try {
        const hour = new Date(await $.clock.now()).getHours()
        await mark($, squaresForTurn(turn, typeof e.answer === 'string' ? e.answer : '', e.isAborted === true, Number(e.durationMs) || 0, hour))
      } catch {
        // Skipped.
      }
      turn = emptyTurn()
    }
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    await mark($, ['subagent'])
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    if (typeof e.agentId !== 'string') await mark($, ['compact'])
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const g = await read($, game)
    const { Box, Text, Button } = $.ui.resolve(e)
    const columns = e.props.bodyColumns || 60
    const cellW = Math.floor(columns / 5)
    const marked = g.ids.filter((id) => id in g.marks).length
    const lines = completedLines(g.ids, g.marks)

    const header = Box({
      flexDirection: 'row',
      columnGap: 1,
      children: [Text({ bold: true, children: ['Bingo'] }), Text({ dimColor: true, children: [g.date + ' · ' + marked + '/' + CARD_SIZE + ' marked · ' + lines.length + ' line' + (lines.length === 1 ? '' : 's')] })],
    })

    const cellLabel = (pos: number) => {
      const id = idAt(g.ids, pos)
      return id === null ? 'FREE' : labelOf(id)
    }
    const rows = [0, 1, 2, 3, 4].map((r) => {
      const cells = [0, 1, 2, 3, 4].map((c) => {
        const pos = r * 5 + c
        const done = isMarked(g.ids, g.marks, pos)
        if (cellW >= 11) {
          // Roomy: a bordered cell, green when marked.
          return Box({
            key: 'cell-' + pos,
            width: cellW,
            height: 4,
            borderStyle: 'single',
            borderColor: done ? 'green' : undefined,
            borderDimColor: !done,
            paddingX: 1,
            overflow: 'hidden',
            children: [Text({ wrap: 'wrap', bold: done, color: done ? 'green' : undefined, children: [(done ? '✔ ' : '') + cellLabel(pos)] })],
          })
        }
        // Narrow: one text cell per square, inverse when marked.
        const w = Math.max(cellW - 1, 4)
        const text = cellLabel(pos).slice(0, w).padEnd(w)
        return Box({ key: 'cell-' + pos, children: [Text({ inverse: done, dimColor: !done, children: [text] })] })
      })
      return Box({ flexDirection: 'row', columnGap: cellW >= 11 ? 0 : 1, children: cells })
    })

    const footer = Box({
      flexDirection: 'row',
      columnGap: 3,
      children: [
        Button({ key: 'new', label: 'New card', hotkey: 'n', plain: true, onPress: async () => load($, true) }),
        Button({ key: 'loud', label: g.loud ? 'Quiet' : 'Loud', hotkey: 'l', plain: true, onPress: async () => {
          const loud = !g.loud
          await $.store.set('loud', loud)
          await update($, game, (v) => ({ ...v, loud }))
        } }),
        Text({ dimColor: true, children: ['Esc closes'] }),
      ],
    })

    return Box({ flexDirection: 'column', rowGap: cellW >= 11 ? 0 : 1, children: [header, ...rows, footer] })
  })
}
