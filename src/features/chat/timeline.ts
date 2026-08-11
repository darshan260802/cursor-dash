import type { Message } from "@/lib/types"

/** A compact summary row rendered before each user message — model,
 * message count, token sum, and how long the turn took. Turns are kept
 * as their own virtualized row (not a wrapper around the turn's
 * messages) specifically so a single agentic turn with 80+ tool calls
 * still virtualizes at the message level rather than rendering as one
 * giant unvirtualized block. */
export interface TurnHeaderItem {
  type: "turn"
  turnIndex: number
  model: string | null
  messageCount: number
  tokens: number
  elapsedMs: number | null
}

export interface MessageItem {
  type: "message"
  message: Message
  turnIndex: number
  /** True for the user message itself, or the first assistant message in
   * a consecutive run — controls whether the avatar/model chip repeats. */
  isFirstInRun: boolean
}

export type TimelineItem = TurnHeaderItem | MessageItem

export function buildTimeline(messages: Message[]): TimelineItem[] {
  const items: TimelineItem[] = []
  let turnIndex = -1
  let lastWasAssistant = false

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role === "user") {
      turnIndex++
      let j = i + 1
      while (j < messages.length && messages[j].role !== "user") j++
      const turnSlice = messages.slice(i, j)
      const model = turnSlice.find((x) => x.role === "assistant" && x.model)?.model ?? null
      const tokens = turnSlice.reduce((n, x) => n + x.tokens.input + x.tokens.output, 0)
      const first = turnSlice[0]
      const last = turnSlice[turnSlice.length - 1]
      const elapsedMs =
        first.createdAt && last.createdAt && last !== first
          ? new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime()
          : null
      items.push({ type: "turn", turnIndex, model, messageCount: turnSlice.length, tokens, elapsedMs })
      items.push({ type: "message", message: m, turnIndex, isFirstInRun: true })
      lastWasAssistant = false
    } else {
      items.push({ type: "message", message: m, turnIndex: Math.max(turnIndex, 0), isFirstInRun: !lastWasAssistant })
      lastWasAssistant = true
    }
  }
  return items
}
