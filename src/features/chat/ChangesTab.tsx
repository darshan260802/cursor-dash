import { FilePlus2, FilePenLine } from "lucide-react"
import { useSessionFiles } from "@/lib/api"
import { pathBasename } from "@/lib/format"
import { EmptyState } from "@/components/EmptyState"
import { Badge } from "@/components/ui/badge"
import { DiffViewer } from "./tools/DiffViewer"

/** Per-file rollup across the whole session — joins Cursor's
 * `originalFileStates` against every edit-kind tool call that touched
 * each path (server/cache.js's buildFileChanges), so this reads as "what
 * changed" rather than a chronological list of individual edits. */
export function ChangesTab({ sessionId }: { sessionId: string }) {
  const { data: files, isLoading } = useSessionFiles(sessionId)

  if (!isLoading && (!files || files.length === 0)) {
    return <EmptyState title="No file changes" description="This session didn't create or edit any files." />
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {files?.map((f) => (
        <li key={f.path} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm">
          {f.isNewlyCreated ? (
            <FilePlus2 className="size-4 shrink-0 text-mint" />
          ) : (
            <FilePenLine className="size-4 shrink-0 text-amber" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium" title={f.path}>
              {pathBasename(f.path)}
            </div>
            <div className="truncate text-xs text-muted-foreground">{f.path}</div>
          </div>
          {f.isNewlyCreated && (
            <Badge variant="mint" className="shrink-0 text-[10px]">
              new
            </Badge>
          )}
          <span className="num shrink-0 text-xs">
            <span className="text-mint">+{f.added}</span> <span className="text-coral">−{f.removed}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {f.editCount} edit{f.editCount === 1 ? "" : "s"}
          </span>
          {(f.beforeContentId || f.afterContentId) && (
            <DiffViewer sessionId={sessionId} path={f.path} beforeContentId={f.beforeContentId} afterContentId={f.afterContentId} />
          )}
        </li>
      ))}
    </ul>
  )
}
