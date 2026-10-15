export type Todo = {
  id: number
  text: string
  from: 'user' | 'agent'
  isDone: boolean
}

declare module 'claude-code' {
  interface PluginState {
    todo: { items: Todo[] }
  }
}
