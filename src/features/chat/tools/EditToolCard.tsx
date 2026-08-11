import { useState } from "react"
import { FilePenLine } from "lucide-react"
import type { EditToolDetail, ToolCall } from "@/lib/types"
import { pathBasename } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ToolCardShell } from "./ToolCardShell"
import { DiffViewer } from "./DiffViewer"

const COLLAPSED_LINES = 12

export function EditToolCard({ tool, sessionId }: { tool: ToolCall; sessionId: string }) {
  const detail = tool.detail as EditToolDetail | null
  const path = detail?.path
  const [expanded, setExpanded] = useState(false)

  const hunks = detail?.hunks ?? []
  const visible = expanded ? hunks : hunks.slice(0, COLLAPSED_LINES)
  const hiddenCount = hunks.length - visible.length

  const summary = (
    <span className="flex items-center gap-1.5">
      {path && <span className="num truncate">{pathBasename(path)}</span>}
      {detail?.added != null && <span className="text-mint">+{detail.added}</span>}
      {detail?.removed != null && <span className="text-coral">−{detail.removed}</span>}
    </span>
  )

  return (
    <ToolCardShell icon={<FilePenLine className="size-3 shrink-0" />} title={tool.name} summary={summary} status={tool.status} defaultOpen>
      {hunks.length > 0 ? (
        <>
          <div className="num overflow-hidden rounded-md border border-border">
            {visible.map((h, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2 px-2 py-0.5 text-[12px] leading-relaxed whitespace-pre-wrap",
                  h.type === "added" && "bg-mint/10",
                  h.type === "removed" && "bg-coral/10"
                )}
              >
                <span className="w-5 shrink-0 text-right text-muted-foreground/70 select-none">
                  {h.type === "added" ? "+" : h.type === "removed" ? "−" : ""}
                </span>
                <span className={cn("flex-1 break-words", h.type === "added" && "text-mint", h.type === "removed" && "text-coral")}>
                  {h.content || " "}
                </span>
              </div>
            ))}
          </div>
          {hiddenCount > 0 && (
            <button type="button" onClick={() => setExpanded(true)} className="self-start text-xs text-amber hover:underline">
              Show {hiddenCount} more line{hiddenCount === 1 ? "" : "s"}
            </button>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {detail?.beforeContentId || detail?.afterContentId
            ? "No line-by-line diff recorded for this edit — view the full file instead."
            : "No diff data available for this edit."}
        </p>
      )}
      {(detail?.beforeContentId || detail?.afterContentId) && (
        <div>
          <DiffViewer
            sessionId={sessionId}
            path={path ?? null}
            beforeContentId={detail?.beforeContentId ?? null}
            afterContentId={detail?.afterContentId ?? null}
          />
        </div>
      )}
    </ToolCardShell>
  )
}
