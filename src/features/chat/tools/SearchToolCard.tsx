import { Search } from "lucide-react"
import type { SearchToolDetail, ToolCall } from "@/lib/types"
import { ToolCardShell } from "./ToolCardShell"

export function SearchToolCard({ tool }: { tool: ToolCall }) {
  const detail = tool.detail as SearchToolDetail | null

  return (
    <ToolCardShell
      icon={<Search className="size-3 shrink-0" />}
      title={tool.name}
      summary={
        <span className="flex items-center gap-1.5">
          {detail?.pattern && <span className="num truncate">{detail.pattern}</span>}
          {detail?.matchCount != null && (
            <span className="text-muted-foreground/70">
              {detail.matchCount} match{detail.matchCount === 1 ? "" : "es"}
            </span>
          )}
        </span>
      }
      status={tool.status}
      durationMs={tool.durationMs}
    >
      {detail?.targetDirectory && <p className="num truncate text-xs text-muted-foreground">in {detail.targetDirectory}</p>}
      {detail?.matches && detail.matches.length > 0 && (
        <ul className="num max-h-56 overflow-y-auto text-xs text-muted-foreground">
          {detail.matches.map((m, i) => (
            <li key={i} className="truncate py-0.5">
              {m}
            </li>
          ))}
        </ul>
      )}
    </ToolCardShell>
  )
}
