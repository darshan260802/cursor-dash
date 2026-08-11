import { FileText } from "lucide-react"
import type { ReadToolDetail, ToolCall } from "@/lib/types"
import { pathBasename } from "@/lib/format"
import { ToolCardShell } from "./ToolCardShell"

export function ReadToolCard({ tool }: { tool: ToolCall }) {
  const detail = tool.detail as ReadToolDetail | null
  const range =
    detail?.offset != null || detail?.limit != null
      ? `lines ${detail?.offset ?? 1}–${(detail?.offset ?? 0) + (detail?.limit ?? 0) || detail?.totalLinesInFile || ""}`
      : detail?.totalLinesInFile
        ? `${detail.totalLinesInFile} lines`
        : null

  return (
    <ToolCardShell
      icon={<FileText className="size-3 shrink-0" />}
      title={tool.name}
      summary={
        <span className="flex items-center gap-1.5">
          <span className="num truncate">{detail?.path ? pathBasename(detail.path) : "—"}</span>
          {range && <span className="text-muted-foreground/70">{range}</span>}
        </span>
      }
      status={tool.status}
      durationMs={tool.durationMs}
    >
      {detail?.path && <p className="num truncate text-xs text-muted-foreground">{detail.path}</p>}
    </ToolCardShell>
  )
}
