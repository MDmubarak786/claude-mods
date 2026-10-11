// pairs: memory pairs in a pane.
//
//   /pairs           open the game
//   /pairs new       deal a new game
//   /pairs stats     games, finished, fewest turns, fastest time
//
// In the pane: each face-down card shows a letter, a to p; press it to turn
// the card. Turn two the same and they stay up; two different turn back after
// a moment. The clock runs from the first card to the last pair and stops while
// the pane is closed. r deals again, t shows the how-to. Nothing here calls a model,
// reads what Claude is doing, or leaves the machine.

import { atom, read, update } from 'claude-code'
import type { Game, Stats } from '../types'
import { CARDS, FACES, KEYS, SIZE, elapsed, formatMs, hideMiss, isGame, newGame, pairsFound, pause, turn } from './game'

const PANE = 'pairs'
const HIDE_MS = 900
const EMPTY_STATS: Stats = { games: 0, finished: 0, bestTurns: 0, bestMs: 0 }
const EMPTY: Game = { seed: 0, faces: [], matched: [], up: [], turns: 0, done: false, elapsedMs: 0, startedAt: null, stats: EMPTY_STATS }
const game = atom({ plugin: 'pairs', key: 'game' } as const, EMPTY)

// Turns a mismatched pair back down after a moment. Dies with the module on reload.
let hiding: { cancel: () => void } | null = null
// Redraws the running clock once a second while the pane is open and a game is on.
let ticking: { cancel: () => void } | null = null
// The how-to block: shown on a fresh deal until the first card, or until t
// has set it either way for the session.
let help: boolean | null = null
// False after the store could not be read: then nothing is written over the
// saved record until a later load reads it.
let storeOk = true

async function save($, g: Game) {
  if (!storeOk) return
  try {
    await $.store.set('game', g)
  } catch {
    // The drawing still updates; the store catches up on the next change.
  }
}

async function change($, fn: (cur: Game) => Game): Promise<Game> {
  let out: Game | null = null
  await update($, game, (cur) => {
    out = fn(cur)
    return out
  })
  // The empty default is never written over a saved deal.
  if (out && (out as Game).seed) await save($, out)
  return out ?? (await read($, game))
}

async function load($) {
  let saved: unknown = undefined
  let readable = true
  try {
    saved = await $.store.get('game')
  } catch {
    readable = false
  }
  storeOk = readable
  // A deal saved by 0.1.0 has no clock fields; give it a stopped clock and no
  // fastest time rather than throwing the record away.
  let migrated = false
  if (saved && typeof saved === 'object') {
    const s = saved as Record<string, unknown>
    const stats = s.stats as Record<string, unknown> | undefined
    migrated = !('elapsedMs' in s) || !(stats && typeof stats === 'object' && 'bestMs' in stats)
    saved = { elapsedMs: 0, startedAt: null, ...s, stats: stats && typeof stats === 'object' ? { bestMs: 0, ...stats } : stats }
  }
  if (isGame(saved)) {
    // A pair left up across a restart turns back down, and the clock waits for
    // the next card: a stretch cut off by a restart isn't counted.
    const g = hideMiss({ ...(saved as Game), startedAt: null })
    await update($, game, () => g)
    if (migrated) await save($, g)
    return
  }
  if (!readable) {
    const cur = await read($, game)
    if (!cur.seed) await update($, game, () => newGame(Date.now(), { ...EMPTY_STATS, games: 1 }))
    $.ui.log('pairs could not read its saved game; playing without saving')
    return
  }
  const fresh = newGame(await $.clock.now(), { ...EMPTY_STATS, games: 1 })
  await update($, game, () => fresh)
  await save($, fresh)
}

function stopHiding() {
  if (hiding) hiding.cancel()
  hiding = null
}

function stopTicking() {
  if (ticking) ticking.cancel()
  ticking = null
}

// The clock in the header only changes once a second, so a tick asks for a
// redraw rather than changing the game; it stops itself when nothing is running.
function startTicking($) {
  if (ticking) return
  ticking = $.clock.every(1000, async () => {
    try {
      const cur = await read($, game)
      if (cur.done || cur.startedAt === null) {
        stopTicking()
        return
      }
      $.ui.invalidate('ui.render')
    } catch {
      // A missed tick just leaves the clock a second behind.
    }
  })
}

function scheduleHide($) {
  stopHiding()
  hiding = $.clock.after(HIDE_MS, async () => {
    hiding = null
    try {
      await change($, hideMiss)
    } catch {
      // The pair stays up until the next turn hides it.
    }
  })
}

async function startNew($) {
  stopHiding()
  stopTicking()
  const now = await $.clock.now()
  return change($, (cur) => newGame(now, { ...cur.stats, games: cur.stats.games + 1 }))
}

function summary(g: Game, now: number): string {
  if (!g.seed) return 'No game yet.'
  const time = formatMs(elapsed(g, now))
  const state = g.done ? 'All found in ' + g.turns + ' turns and ' + time + '.' : pairsFound(g) + ' of ' + CARDS / 2 + ' pairs found, ' + g.turns + ' turns, ' + time + '.'
  return 'Pairs: ' + state + (g.stats.bestTurns ? ' Best ' + g.stats.bestTurns + ' turns, ' + formatMs(g.stats.bestMs) + '.' : '') + ' /pairs opens the pane.'
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    help = null
    try {
      await load($)
    } catch (error) {
      $.ui.log('pairs could not load its game: ' + error)
    }
    try {
      await $.command.register({ name: 'pairs', description: 'Play memory pairs in a pane', argumentHint: '[new | stats]', immediate: true })
    } catch (error) {
      $.ui.log('could not register /pairs: ' + error)
    }
    return next(e)
  })

  // /clear and /resume reset $.state; the game lives on in the store.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    stopHiding()
    stopTicking()
    await load($)
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('command.run', { command: 'pairs' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()
    if (args === 'new') return { text: 'New deal. ' + summary(await startNew($), await $.clock.now()) }
    if (args === 'stats') {
      const s = (await read($, game)).stats
      return { text: 'Games ' + s.games + ' · finished ' + s.finished + ' · fewest turns ' + (s.bestTurns || '—') + ' · fastest ' + (s.bestMs ? formatMs(s.bestMs) : '—') }
    }
    if (args) return { text: 'Usage: /pairs, /pairs new, or /pairs stats' }
    // Under claude -p nothing draws, and ui.open still reports the pane as placed:
    // the surfaces list is the reliable sign.
    let surfaces = []
    try {
      surfaces = await $.session.surfaces()
    } catch {
      surfaces = []
    }
    if (!surfaces.length) return { text: summary(await read($, game), await $.clock.now()) }
    const placed = await $.ui.open({ id: PANE, title: 'Pairs', focus: true, closeOnEscape: true, rows: 22 })
    if (!placed.isPlaced) return { text: summary(await read($, game), await $.clock.now()) }
    // A game paused by closing the pane picks its clock up at the next card.
    return {}
  }).catch(async () => ({ text: 'pairs: the command failed.' }))

  // Closing the pane turns a mismatched pair down at once and stops the clock.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    stopHiding()
    stopTicking()
    const now = await $.clock.now()
    await change($, (cur) => pause(hideMiss(cur), now))
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const g = await read($, game)
    const { Box, Text, Button } = $.ui.resolve(e)
    if (!g.seed) return Text({ children: ['No game loaded. /pairs new starts one.'] })
    const columns = e.props.bodyColumns || 60
    const wide = columns >= 50
    const showHelp = help ?? (wide && g.turns === 0 && !g.up.length)
    const desktop = e.surface === 'desktop'
    const found = pairsFound(g)
    const now = await $.clock.now()
    const time = formatMs(elapsed(g, now))
    if (!g.done && g.startedAt !== null) startTicking($)

    const status = g.done ? { text: 'All eight pairs in ' + g.turns + ' turns and ' + time + (g.stats.bestTurns === g.turns && g.stats.bestMs === g.elapsedMs ? ', your best on both. ' : g.stats.bestMs === g.elapsedMs ? ', your fastest. ' : g.stats.bestTurns === g.turns ? ', your fewest turns. ' : '. ') + 'Press r for a new deal.', color: 'success', bold: true }
      : g.up.length === 2 ? { text: 'Not a pair. They turn back in a moment.', color: 'warning' }
      : g.up.length === 1 ? { text: 'Now find its twin.', color: 'suggestion' }
      : g.turns === 0 ? { text: 'Press a card\'s letter to turn it over.', color: 'suggestion' }
      : { text: found + ' of 8 pairs found. Turn a card.', color: 'suggestion' }

    const header = Box({ flexDirection: 'column', children: [
      Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: [
        Text({ bold: true, children: ['PAIRS'] }),
        Text({ children: ['turns ', Text({ bold: true, children: [String(g.turns)] })] }),
        Text({ children: ['found ' + found + '/8'] }),
        Text({ bold: true, color: g.done ? 'success' : g.startedAt !== null ? 'warning' : undefined, dimColor: g.startedAt === null && !g.done, children: ['time ' + time] }),
        Text({ dimColor: true, children: ['best ' + (g.stats.bestTurns ? g.stats.bestTurns + ' turns, ' + formatMs(g.stats.bestMs) : '—') + ' · game ' + g.stats.games] }),
      ] }),
      Text({ color: status.color, bold: status.bold, wrap: 'wrap', children: [status.text] }),
    ] })

    // Every card is a fixed-width Box so the grid lines up on any surface. A
    // face-down card shows its key (the desktop draws the key as a badge, so the
    // label is blank there); a card that is up shows its face on yellow, a found
    // pair its face on green.
    const card = (i: number) => {
      const isUp = g.up.includes(i)
      const shown = g.matched[i] || isUp
      const backgroundColor = g.matched[i] ? 'success' : isUp ? 'warning' : undefined
      const label = shown ? FACES[g.faces[i]] : desktop ? ' ' : KEYS[i]
      return Box({ width: 5, justifyContent: 'center', backgroundColor, children: [
        Button({ key: 'card-' + i, label, hotkey: shown ? undefined : KEYS[i], dimColor: !shown, onPress: async () => {
          let error: string | undefined
          let outcome: string | undefined
          const pressedAt = await $.clock.now()
          const after = await change($, (cur) => {
            const r = turn(cur, i, pressedAt)
            error = r.error
            outcome = r.outcome
            return r.game
          })
          if (error) {
            $.ui.toast(error)
            return
          }
          // A stale timer is harmless: hideMiss only acts on a mismatched pair.
          if (outcome === 'miss') scheduleHide($)
          if (after.done) {
            stopTicking()
            $.ui.toast('All pairs found in ' + after.turns + ' turns and ' + formatMs(after.elapsedMs) + '!', { timeoutMs: 5000 })
          }
        } }),
      ] })
    }
    const grid = Box({ flexDirection: 'column', children: Array.from({ length: SIZE }, (_, r) => Box({ flexDirection: 'row', columnGap: 1, children: Array.from({ length: SIZE }, (_, c) => card(r * SIZE + c)) })) })

    const howTo = Box({ flexDirection: 'column', borderStyle: 'round', borderColor: 'suggestion', paddingX: 1, children: [
      Text({ bold: true, children: ['How to play'] }),
      Text({ wrap: 'wrap', children: ['1. Sixteen cards lie face down, eight matching pairs. Press a card\'s letter, a to p, or click it, to turn it over.'] }),
      Text({ wrap: 'wrap', children: ['2. Turn a second card. A pair stays up; two different cards turn back after a moment. Remember where they were.'] }),
      Text({ wrap: 'wrap', children: ['3. Find all eight pairs in as few turns, and as little time, as you can. The clock runs from your first card and pauses while the pane is closed. Your best of each is kept.'] }),
      Text({ dimColor: true, wrap: 'wrap', children: ['Keys need the pane focused: click it if nothing happens. t hides this.'] }),
    ] })

    const footer = Box({ flexDirection: 'row', columnGap: 3, flexWrap: 'wrap', children: [
      Button({ key: 'new', label: 'New deal', hotkey: 'r', plain: true, onPress: () => startNew($) }),
      Button({ key: 'help', label: showHelp ? 'Hide help' : 'How to play', hotkey: 't', plain: true, dimColor: true, onPress: () => {
        help = !showHelp
        $.ui.invalidate('ui.render')
      } }),
      Text({ dimColor: true, children: ['Esc closes'] }),
    ] })

    return Box({ flexDirection: 'column', rowGap: 1, children: showHelp ? [header, grid, howTo, footer] : [header, grid, footer] })
  })
}
