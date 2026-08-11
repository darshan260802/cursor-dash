import { CornerDownRight } from "lucide-react"
import type { TurnHeaderItem } from "./timeline"
import { formatDuration, formatTokens } from "@/lib/format"

export function TurnHeader({ turn }: { turn: TurnHeaderItem }) {
  if (turn.turnIndex === 0) return null // the first turn needs no separator above it
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-1 text-[11px] text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <CornerDownRight className="size-3 shrink-0" />
      {turn.model && <span className="num shrink-0">{turn.model}</span>}
      <span className="shrink-0">{turn.messageCount} messages</span>
      {turn.tokens > 0 && <span className="num shrink-0">{formatTokens(turn.tokens)} tok</span>}
      {turn.elapsedMs != null && <span className="num shrink-0">{formatDuration(turn.elapsedMs)}</span>}
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}
