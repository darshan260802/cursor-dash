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

const ROW_CHROME_PX = 56 // avatar rail + vertical padding shared by every message row
const LINE_PX = 20

/** A rough per-block height guess, used only to seed the virtualizer's
 * initial layout before it measures the real DOM — accuracy here trades
 * off directly against scroll jank (a bad estimate means a large jump
 * once the real height is measured), so it's worth being deliberate
 * about which blocks default open vs. collapsed matches the actual
 * components (EditToolCard/TodoToolCard default open, everything else
 * default closed — see their `defaultOpen` props). */
function estimateBlockHeight(block: Message["blocks"][number]): number {
  switch (block.kind) {
    case "thinking":
      return 36 // collapsed by default
    case "text":
      return Math.min(400, LINE_PX * Math.ceil((block.text.length || 1) / 70))
    case "code":
      return 150
    case "error":
      return 50
    case "tool": {
      const t = block.tool
      if (t.kind === "edit") {
        const hunks = "hunks" in (t.detail ?? {}) ? (t.detail as { hunks?: unknown[] }).hunks?.length ?? 0 : 0
        return 90 + Math.min(hunks, 12) * LINE_PX
      }
      if (t.kind === "todo") {
        const todos = "todos" in (t.detail ?? {}) ? (t.detail as { todos?: unknown[] }).todos?.length ?? 0 : 0
        return 50 + todos * 24
      }
      return 36 // collapsed by default: terminal, read, search, web, generic
    }
    default:
      return 40
  }
}

export function estimateMessageHeight(message: Message): number {
  if (message.blocks.length === 0) return ROW_CHROME_PX + 20
  return ROW_CHROME_PX + message.blocks.reduce((sum, b) => sum + estimateBlockHeight(b), 0)
}

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
