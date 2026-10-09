// mcp-diet: choose which MCP tools and subagent types Claude sees, per project.
//
//   /mcp-diet                     open the pane (or print the list where nothing draws)
//   /mcp-diet list                print every server, tool, and agent type with sizes
//   /mcp-diet defer <name>        Claude sees the tool's name only, until it searches for it
//   /mcp-diet hide <name>         the tool or agent type is withheld from Claude
//   /mcp-diet show <name>         back to normal
//
// <name> is a tool (mcp__server__tool), a whole server (mcp__server), or a
// subagent type. Choices are saved per project. Claude Code asks for a tool's
// description once, when it's first sent, so a change applies to the next
// session, not the running one.

type Mode = 'defer' | 'hide'
type Choices = Record<string, Mode>

let root = ''
let choices: Choices = {}
const agentTypes = new Map<string, string>() // name -> description, as offered this session

const PANE = 'mcp-diet'

async function loadChoices($) {
  try {
    root = await $.session.root()
    const saved = await $.store.get('mcp-diet:' + root)
    choices = saved && typeof saved === 'object' ? (saved as Choices) : {}
  } catch {
    choices = {}
  }
}

async function saveChoices($) {
  await $.store.set('mcp-diet:' + root, choices)
}

function serverOf(tool: string): string | null {
  const m = /^(mcp__[^_]+(?:_[^_]+)*?)__/.exec(tool)
  return m ? m[1] : null
}

// The most specific choice wins: tool, then its server.
function modeFor(name: string): Mode | null {
  if (choices[name]) return choices[name]
  const server = serverOf(name)
  if (server && choices[server]) return choices[server]
  return null
}

function tokens(chars: number): number {
  return Math.round(chars / 4)
}

async function inventory($) {
  const tools = await $.tool.list()
  const servers = new Map<string, { name: string; description: string; mode: Mode | null }[]>()
  for (const t of tools) {
    if (!t.mcp) continue
    const server = serverOf(t.name) ?? 'mcp'
    if (!servers.has(server)) servers.set(server, [])
    servers.get(server)!.push({ name: t.name, description: t.description ?? '', mode: modeFor(t.name) })
  }
  return servers
}

function listText(servers: Map<string, { name: string; description: string; mode: Mode | null }[]>): string {
  const lines: string[] = []
  let total = 0
  for (const [server, tools] of servers) {
    const chars = tools.reduce((n, t) => n + t.description.length, 0)
    total += tools.filter((t) => !t.mode).reduce((n, t) => n + t.description.length, 0)
    lines.push(server + (choices[server] ? ' [' + choices[server] + ']' : '') + ': ' + tools.length + ' tool(s), ~' + tokens(chars) + ' tokens of descriptions')
    for (const t of tools) lines.push('  ' + t.name.slice(server.length + 2) + (t.mode ? ' [' + t.mode + ']' : '') + ' ~' + tokens(t.description.length))
  }
  for (const [name, description] of agentTypes) lines.push('agent ' + name + (choices[name] ? ' [' + choices[name] + ']' : '') + ' ~' + tokens(description.length))
  if (!lines.length) return 'No MCP tools or subagent types seen in this session.'
  lines.push('About ' + tokens(total) + ' tokens of MCP tool descriptions are sent in full. Changes apply to the next session.')
  return lines.join('\n')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await loadChoices($)
    try {
      await $.command.register({ name: 'mcp-diet', description: 'Defer or hide MCP tools and subagent types for this project', argumentHint: '[list | defer|hide|show <name>]' })
    } catch (error) {
      $.ui.log('could not register /mcp-diet: ' + error)
    }
    return next(e)
  })

  // Claude Code asks for each tool's description once; answer from the saved choice.
  on('tool.describe', async ($, e, next) => {
    const mode = modeFor(e.tool)
    if (!mode) return next(e)
    if (mode === 'hide') return { description: 'Not available in this project.', isDeferred: true }
    const theirs = await next(e)
    return { ...theirs, isDeferred: true }
  })

  on('agent.offer', async ($, e, next) => {
    agentTypes.set(e.agent, e.description ?? '')
    if (choices[e.agent] === 'hide') return { isOffered: false }
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('command.run', { command: 'mcp-diet' }, async ($, e) => {
    const args = e.args.trim()
    const m = /^(defer|hide|show)\s+(\S+)$/.exec(args)
    if (m) {
      const [, verb, name] = m
      if (verb === 'show') delete choices[name]
      else choices[name] = verb as Mode
      await saveChoices($)
      $.ui.invalidate('ui.render')
      return { text: (verb === 'show' ? 'Showing ' : verb === 'defer' ? 'Deferring ' : 'Hiding ') + name + ' in this project from the next session on.' }
    }
    const servers = await inventory($)
    if (args === 'list') return { text: listText(servers) }
    if (args) return { text: 'Usage: /mcp-diet, /mcp-diet list, or /mcp-diet defer|hide|show <name>' }
    const placed = await $.ui.open({ id: PANE, title: 'MCP diet', focus: true, closeOnEscape: true })
    if (!placed.isPlaced) return { text: listText(servers) }
    return {}
  }).catch(async () => ({ text: 'mcp-diet: the command failed, so nothing changed.' }))

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const servers = await inventory($)
    const rows: unknown[] = [Text({ bold: true, children: ['MCP tools and subagent types for this project. Changes apply next session.'] })]
    const cycle = (name: string) => async () => {
      const current = choices[name]
      if (!current) choices[name] = 'defer'
      else if (current === 'defer') choices[name] = 'hide'
      else delete choices[name]
      await saveChoices($)
      $.ui.invalidate('ui.render')
    }
    const label = (name: string) => (choices[name] ?? 'on')
    for (const [server, tools] of servers) {
      rows.push(Box({ flexDirection: 'row', columnGap: 1, children: [Button({ key: 'srv-' + server, label: label(server), plain: true, onPress: cycle(server) }), Text({ bold: true, children: [server + '  ~' + tokens(tools.reduce((n, t) => n + t.description.length, 0)) + ' tokens'] })] }))
      for (const t of tools) {
        rows.push(Box({ flexDirection: 'row', columnGap: 1, paddingLeft: 2, children: [Button({ key: 'tool-' + t.name, label: label(t.name), plain: true, onPress: cycle(t.name) }), Text({ dimColor: !!t.mode, children: [t.name.slice(server.length + 2) + '  ~' + tokens(t.description.length)] })] }))
      }
    }
    for (const [name, description] of agentTypes) {
      rows.push(Box({ flexDirection: 'row', columnGap: 1, children: [Button({ key: 'agent-' + name, label: choices[name] === 'hide' ? 'hide' : 'on', plain: true, onPress: async () => { if (choices[name] === 'hide') delete choices[name]; else choices[name] = 'hide'; await saveChoices($); $.ui.invalidate('ui.render') } }), Text({ children: ['agent ' + name + '  ~' + tokens(description.length)] })] }))
    }
    if (rows.length === 1) rows.push(Text({ dimColor: true, children: ['No MCP tools or subagent types seen in this session.'] }))
    rows.push(Text({ dimColor: true, children: ['Press a button to cycle on → defer → hide. Esc closes.'] }))
    return Box({ flexDirection: 'column', children: rows })
  })
}
