import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const world = (on: On) => {
  mock.store(on)
  on('session.cwd', () => ({ value: '/project' }))
  on('ui.status', () => ({ value: undefined }))
}

const PANE = {
  component: 'Pane',
  requestId: 'todo',
  props: { title: 'To-do', isFocused: true, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('the agent adds and ticks off items', async ($, on) => {
  world(on)
  const added = await $.tool.call({ tool: 'mcp__todo__todo', op: 'add', items: ['write tests', 'push'] })
  expect(String(added.result)).toContain('#2 [ ] push')

  const ticked = await $.tool.call({ tool: 'mcp__todo__todo', op: 'done', ids: [1] })
  expect(String(ticked.result)).toContain('#1 [x] write tests')

  const cleared = await $.tool.call({ tool: 'mcp__todo__todo', op: 'clear_done' })
  expect(String(cleared.result)).not.toContain('write tests')
})

test('the pane shows items and toggles them on every surface', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'mcp__todo__todo', op: 'add', text: 'check the build' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'todo', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /check the build/ })).toBeDefined()
    await ui.press({ key: 'toggle-1' })
    const listed = await $.tool.call({ tool: 'mcp__todo__todo', op: 'list' })
    expect(String(listed.result)).toContain(surface === 'terminal' ? '[x]' : '[ ]')
    await ui.unmount()
  }
})

test('open items come back in the next session of the same project', async ($, on) => {
  mock.store(on, { 'items:/project': [{ id: 4, text: 'still open', from: 'user', isDone: false }, { id: 5, text: 'finished', from: 'agent', isDone: true }] })
  on('session.cwd', () => ({ value: '/project' }))
  on('ui.status', () => ({ value: undefined }))
  const listed = await $.tool.call({ tool: 'mcp__todo__todo', op: 'list' })
  expect(String(listed.result)).toContain('#4 [ ] (user) still open')
  expect(String(listed.result)).not.toContain('finished')
})
