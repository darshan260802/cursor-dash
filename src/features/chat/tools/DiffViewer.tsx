import { Maximize2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CodeBlock } from "../CodeBlock"
import { useSessionContent } from "@/lib/api"
import { langFromPath } from "@/lib/highlighter"
import { pathBasename } from "@/lib/format"

/** "View full file" — lazily fetches the complete before/after text
 * (content-addressed rows Cursor stores per edit) and shows them side by
 * side. Not a re-diffed view — the compact hunk view in EditToolCard
 * already has Cursor's own precomputed diff; this is for full context. */
export function DiffViewer({
  sessionId,
  path,
  beforeContentId,
  afterContentId,
}: {
  sessionId: string
  path: string | null
  beforeContentId: string | null
  afterContentId: string | null
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Maximize2 className="size-3.5" /> View full file
          </Button>
        }
      />
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="num truncate">{path ? pathBasename(path) : "File"}</DialogTitle>
        </DialogHeader>
        <DiffPanes sessionId={sessionId} path={path} beforeContentId={beforeContentId} afterContentId={afterContentId} />
      </DialogContent>
    </Dialog>
  )
}

function DiffPanes({
  sessionId,
  path,
  beforeContentId,
  afterContentId,
}: {
  sessionId: string
  path: string | null
  beforeContentId: string | null
  afterContentId: string | null
}) {
  const before = useSessionContent(sessionId, beforeContentId)
  const after = useSessionContent(sessionId, afterContentId)
  const lang = langFromPath(path)

  return (
    // items-start: without it, CSS Grid's default `align-items: stretch`
    // forces each pane to exactly the row height, and since CodeBlock's
    // outer wrapper has `overflow-hidden`, its flex automatic min-height
    // becomes 0 — so it silently shrinks and clips instead of growing
    // past the row and letting *this* container's own overflow-auto
    // scroll it. items-start lets each pane size to its real content, so
    // this container's scrollHeight correctly exceeds max-h-[70vh] and
    // actually scrolls.
    <div className="grid max-h-[70vh] grid-cols-1 items-start gap-3 overflow-auto sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Before</div>
        {beforeContentId ? (
          before.isLoading ? (
            <div className="p-3 text-xs text-muted-foreground">Loading…</div>
          ) : (
            <CodeBlock code={before.data ?? ""} lang={lang} maxHeight={2000} />
          )
        ) : (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">New file</div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">After</div>
        {afterContentId ? (
          after.isLoading ? (
            <div className="p-3 text-xs text-muted-foreground">Loading…</div>
          ) : (
            <CodeBlock code={after.data ?? ""} lang={lang} maxHeight={2000} />
          )
        ) : (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">File deleted</div>
        )}
      </div>
    </div>
  )
}
