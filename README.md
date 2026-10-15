# todo – a to-do pane for Claude Code

A Claude Code mod that gives the agent a to-do list in a side pane, which it keeps itself.

You often think of something while the agent is still busy: a question, feedback on what it just did, "oh, and also…". Normally that message gets folded into the running turn and is easily lost. With this mod every such message lands on the list, and the agent ticks it off once it has handled it.

## What it does

- **To-do pane.** It opens beside the chat when a session starts. Open items come first, done ones are dimmed and struck through, and your own items show in cyan with "You:". Click `[ ]` to tick an item yourself, and "Clear done" removes the ticked ones.
- **Messages sent mid-turn go on the list.** Anything you type while the agent is working becomes an item, and the agent is told its number ("on the to-do pane as #4, handle it, then mark it done"). It finishes its current step first, unless your message says to stop or change course. Short replies like "ok" or "thanks" (under 15 characters with no question mark) are left off.
- **The agent's own notes.** The agent gets a `todo` tool (add, done, undo, remove, clear done, list, show), plus a short instruction in its system prompt. It uses the list for multi-step work, open questions and follow-ups, and checks the open items before it ends a turn.
- **Open items survive the session.** They are saved per project folder, so the next session in the same project starts with what was left open.
- **Status line.** Shows `To-do: N open`.
- **`/todo`** opens the pane, and **`/todo <text>`** adds an item.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install todo --marketplace hasanocaksirkeci-ux/claude-todo-pane
```

Answer `y` to add the marketplace, then pick a scope (user scope = every project).

From a shell:

```
claude plugin install todo --marketplace hasanocaksirkeci-ux/claude-todo-pane
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins → Add marketplace** with `hasanocaksirkeci-ux/claude-todo-pane`, then **Add plugin**.

## Where the pane shows

The pane needs a surface that draws panes:

- **Terminal:** docked to the right in fullscreen from about 110 columns, or inline above the prompt when the window is narrower.
- **Desktop app:** shows the pane.
- **Cloud sessions viewed in the Claude app or on the web:** nothing draws the pane. The list and the tool still work, but you won't see the pane there.

## Notes

- The system-prompt instruction uses the `prompt.compose` hook. Where an organization manages Claude Code, that hook only runs for plugins the organization lists. The pane, the tool and the mid-turn capture still work.
- Tests: `claude plugin test .`

## Files

- `hooks/register.tsx`: the mod (pane, tool, prompt hooks)
- `hooks/todo.test.ts`: tests
- `types/index.d.ts`: the shape of the list kept in session state
