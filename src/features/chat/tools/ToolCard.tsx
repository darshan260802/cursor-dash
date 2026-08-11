import type { ToolCall } from "@/lib/types"
import { EditToolCard } from "./EditToolCard"
import { TerminalToolCard } from "./TerminalToolCard"
import { ReadToolCard } from "./ReadToolCard"
import { SearchToolCard } from "./SearchToolCard"
import { TodoToolCard } from "./TodoToolCard"
import { GenericToolCard } from "./GenericToolCard"

/** Picks the right card for a tool call's `kind`. `web` has no dedicated
 * card yet — it (and anything unrecognized) falls back to the generic
 * args/result view rather than guessing at a layout for data this
 * codebase has never actually observed. */
export function ToolCard({ tool, sessionId }: { tool: ToolCall; sessionId: string }) {
  switch (tool.kind) {
    case "edit":
      return <EditToolCard tool={tool} sessionId={sessionId} />
    case "terminal":
      return <TerminalToolCard tool={tool} />
    case "read":
      return <ReadToolCard tool={tool} />
    case "search":
      return <SearchToolCard tool={tool} />
    case "todo":
      return <TodoToolCard tool={tool} />
    default:
      return <GenericToolCard tool={tool} />
  }
}
