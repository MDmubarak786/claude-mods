// pins: instructions that survive compaction, /clear, and restarts.
//
//   /pin don't touch the migrations     pin an instruction for this project
//   /pin                                list the pins
//   /pin rm 2                           remove pin 2
//   /pin clear                          remove them all
//
// Every prompt carries the pinned list as context that Claude reads and the
// transcript doesn't show. Pins are saved per project root, so they're there
// after compaction, after /clear, and in the next session.

const MAX_PINS = 25

async function key($): Promise<string> {
  return 'pins:' + (await $.session.root())
}

async function load($): Promise<string[]> {
  try {
    const saved = await $.store.get(await key($))
    return Array.isArray(saved) ? saved.filter((p) => typeof p === 'string') : []
  } catch {
    return []
  }
}

function list(pins: string[]): string {
  return pins.map((p, i) => (i + 1) + '. ' + p).join('\n')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'pin', description: 'Pin an instruction that survives compaction and new sessions', argumentHint: '[text | rm N | clear]', immediate: true })
    } catch (error) {
      $.ui.log('could not register /pin: ' + error)
    }
    const pins = await load($)
    if (pins.length) $.ui.log(pins.length + ' pinned instruction(s) for this project. /pin lists them.')
    return next(e)
  })

  on('command.run', { command: 'pin' }, async ($, e) => {
    const args = e.args.trim()
    const pins = await load($)
    if (!args) return { text: pins.length ? 'Pinned for this project:\n' + list(pins) : 'No pins. /pin <text> adds one.' }
    if (args === 'clear') {
      await $.store.delete(await key($))
      return { text: 'Removed ' + pins.length + ' pin(s).' }
    }
    const rm = /^rm\s+(\d+)$/.exec(args)
    if (rm) {
      const n = Number(rm[1])
      if (n < 1 || n > pins.length) return { text: 'No pin ' + n + '. ' + (pins.length ? '/pin lists them.' : 'There are no pins.') }
      const [gone] = pins.splice(n - 1, 1)
      await $.store.set(await key($), pins)
      return { text: 'Removed pin ' + n + ': ' + gone }
    }
    if (pins.length >= MAX_PINS) return { text: 'Already ' + MAX_PINS + ' pins. Remove one first.' }
    pins.push(args)
    await $.store.set(await key($), pins)
    return { text: 'Pinned (' + pins.length + '): ' + args }
  }).catch(async () => ({ text: 'pins: the command failed, so nothing changed.' }))

  on('prompt.submit', async ($, e, next) => {
    const pins = await load($)
    if (!pins.length) return next(e)
    const text = 'Pinned instructions from the user for this project. They apply to every turn, including after compaction:\n' + list(pins)
    return next({ ...e, context: [...(e.context ?? []), text] })
  }).catch(async ($, e, next) => next(e))
}
