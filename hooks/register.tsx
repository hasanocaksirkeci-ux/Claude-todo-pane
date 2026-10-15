import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Todo } from '../types'

const PANE = 'todo'
const TOOL = 'mcp__todo__todo'
const items = atom({ plugin: 'todo', key: 'items' } as const, [])

const GUIDE = [
  '# To-do pane',
  'The person sees a to-do list in a side pane, kept with the `mcp__todo__todo` tool.',
  '- When a task has several steps, add them as items and tick each off (`done`) as you finish it.',
  '- Messages the person sends while you are still working are added for you automatically and arrive with a note naming their item number.',
  '  Finish your current step first unless the message says to stop or change course, then handle it and mark the item done.',
  '- Use it for your own notes too: open questions, things to check later, follow-ups. Keep items short.',
  '- Before ending a turn, look at the open items: handle them, or say why one stays open.',
].join('\n')

const preview = (text: string): string => {
  const line = text.replace(/\s+/g, ' ').trim()

  return line.length > 140 ? `${line.slice(0, 139)}…` : line
}

const listText = (list: readonly Todo[]): string =>
  list.length === 0
    ? 'The list is empty.'
    : list.map(one => `#${one.id} [${one.isDone ? 'x' : ' '}] ${one.from === 'user' ? '(user) ' : ''}${one.text}`).join('\n')

const add = async ($: EngineInterface, text: string, from: Todo['from']): Promise<number> => {
  let id = 0
  await change($, list => {
    id = list.reduce((most, one) => Math.max(most, one.id), 0) + 1

    return [...list, { id, text: preview(text), from, isDone: false }]
  })

  return id
}

const storeKey = async ($: EngineInterface): Promise<string> => `items:${await $.session.cwd()}`

// Every change goes to the pane, the status line and the store, so open items outlive the session.
const change = async ($: EngineInterface, fn: (list: readonly Todo[]) => Todo[]): Promise<void> => {
  await update($, items, fn)
  const list = await read($, items)
  const open = list.filter(one => !one.isDone).length
  $.ui.status(open === 0 ? undefined : `To-do: ${open} open`)
  await $.store.set(await storeKey($), list)
}

const setDone = ($: EngineInterface, ids: readonly number[], isDone: boolean) =>
  change($, list => list.map(one => (ids.includes(one.id) ? { ...one, isDone } : one)))

// "ok", "danke", "ja mach" are replies, not tasks.
const isWorthNoting = (text: string): boolean => text.trim().length >= 15 || text.includes('?')

let isLoaded = false
// The open items of this project's last session, read once, at first use.
const load = async ($: EngineInterface): Promise<void> => {
  if (isLoaded) {
    return
  }
  const stored = await $.store.get(await storeKey($))
  isLoaded = true
  if ((await read($, items)).length === 0 && Array.isArray(stored)) {
    await change($, () => (stored as Todo[]).filter(one => !one.isDone))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await load($)
    await $.tool.register({
      name: 'todo',
      description:
        'Keep the to-do list shown to the person in a side pane. ' +
        'op "add" with text (one item) or items (several); "done" or "undo" with ids; ' +
        '"remove" with ids; "clear_done" drops ticked items; "list" shows the list; "show" opens the pane and says whether it is drawn. ' +
        'Every call answers with the whole list. Open items are kept per project across sessions.',
      inputSchema: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['add', 'done', 'undo', 'remove', 'clear_done', 'list', 'show'] },
          text: { type: 'string', description: 'For add: the item.' },
          items: { type: 'array', items: { type: 'string' }, description: 'For add: several items.' },
          ids: { type: 'array', items: { type: 'number' }, description: 'For done, undo, remove.' },
        },
        required: ['op'],
      },
      isDeferred: false,
    })
    await $.command.register({
      name: 'todo',
      description: 'Open the to-do pane; /todo <text> adds an item',
    })
    void $.ui.open({ id: PANE, title: 'To-do' })

    return next(e)
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    await load($)
    await $.ui.open({ id: PANE, title: 'To-do' })
    const text = (e.args ?? '').trim()
    if (text === '') {
      return { text: 'To-do pane opened.' }
    }
    const id = await add($, text, 'user')

    return { text: `Added #${id}.` }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    await load($)
    const input = e as { op?: string; text?: string; items?: string[]; ids?: number[] }
    const ids = (input.ids ?? []).map(Number)
    switch (input.op) {
      case 'add': {
        const texts = [...(input.text ? [input.text] : []), ...(input.items ?? [])].filter(one => one.trim() !== '')
        if (texts.length === 0) {
          return { deny: 'add needs text or items.' }
        }
        for (const text of texts) {
          await add($, text, 'agent')
        }
        break
      }
      case 'done':
      case 'undo':
        await setDone($, ids, input.op === 'done')
        break
      case 'remove':
        await change($, list => list.filter(one => !ids.includes(one.id)))
        break
      case 'clear_done':
        await change($, list => list.filter(one => !one.isDone))
        break
      case 'show': {
        const opened = await $.ui.open({ id: PANE, title: 'To-do' })
        const where = (await $.session.surfaces()).join(', ') || 'none'
        const placed = opened.isPlaced ? 'The pane is shown.' : `The pane waits undrawn: ${opened.reason}`

        return { result: `${placed} Surfaces: ${where}.\n${listText(await read($, items))}` }
      }
      case 'list':
        break
      default:
        return { deny: `Unknown op "${input.op}".` }
    }

    return { result: listText(await read($, items)) }
  })

  // A message typed while a turn runs goes on the list, so it is not lost.
  on('prompt.submit', async ($, e, next) => {
    await load($)
    const isTyped = ['composer', 'bridge', 'sdk'].includes(e.origin.kind)
    if (e.turnId === undefined || e.command !== undefined || e.isMeta || !isTyped || !isWorthNoting(e.text)) {
      return next(e)
    }
    const id = await add($, e.text, 'user')
    const note = `This message was sent while you were working and is on the to-do pane as #${id}. Handle it, then mark #${id} done with the todo tool.`

    return next({ ...e, context: [...(e.context ?? []), note] })
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return { sections: [...composed.sections, { id: 'todo:guide', text: GUIDE, scope: 'session' }] }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, items)
    const open = list.filter(one => !one.isDone)
    const done = list.filter(one => one.isDone)

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>Nothing on the list yet.</Text>}
        {[...open, ...done].map(one => (
          <Box key={`row-${one.id}`}>
            <Button
              key={`toggle-${one.id}`}
              label={one.isDone ? '[x]' : '[ ]'}
              onPress={() => setDone($, [one.id], !one.isDone)}
            />
            <Text dimColor={one.isDone} strikethrough={one.isDone} color={one.from === 'user' ? 'cyan' : undefined}>
              {' '}#{one.id} {one.from === 'user' ? 'You: ' : ''}{one.text}
            </Text>
          </Box>
        ))}
        {done.length > 0 && (
          <Button
            key="clear-done"
            label={`Clear done (${done.length})`}
            onPress={() => change($, all => all.filter(one => !one.isDone))}
          />
        )}
      </Box>
    )
  })
}
