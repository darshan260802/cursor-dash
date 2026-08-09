import { Link } from "react-router"
import type { SessionSummary } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { formatRelativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { AlertTriangle, GitBranch } from "lucide-react"

export function SessionRow({ session, active }: { session: SessionSummary; active: boolean }) {
  const hasName = !!(session.name || session.subtitle)
  return (
    <Link
      to={`/sessions/${session.id}`}
      className={cn(
        "flex flex-col gap-1.5 border-b border-border px-3 py-2.5 transition-colors hover:bg-muted/60",
        active && "bg-accent/60 hover:bg-accent/60"
      )}
    >
      <div className="flex items-center gap-2">
        <Badge variant={session.mode === "agent" ? "amber" : "iris"} className="shrink-0">
          {session.mode}
        </Badge>
        <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", !hasName && "text-muted-foreground italic")}>
          {session.name || session.subtitle || "Untitled session"}
        </span>
        <span className="num shrink-0 text-[11px] text-muted-foreground">
          {formatRelativeTime(session.lastUpdatedAt ?? session.createdAt)}
        </span>
      </div>

      <div className="h-[3px] w-full overflow-hidden rounded-full bg-border/70">
        <div
          className="h-full bg-amber/70"
          style={{ width: `${Math.max(0, Math.min(100, session.contextUsagePercent ?? 0))}%` }}
        />
      </div>

      <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
        {session.workspaceName && (
          <span className="flex min-w-0 items-center gap-1 truncate">
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate">{session.workspaceName}</span>
          </span>
        )}
        {(session.linesAdded > 0 || session.linesRemoved > 0) && (
          <span className="num shrink-0">
            <span className="text-mint">+{session.linesAdded}</span> <span className="text-coral">-{session.linesRemoved}</span>
          </span>
        )}
      </div>
    </Link>
  )
}

export function SessionRowSkeleton() {
  return (
    <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5">
      <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-[3px] w-full animate-pulse rounded-full bg-muted" />
      <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
    </div>
  )
}

export function SessionRowError() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-coral">
      <AlertTriangle className="size-3" /> Failed to load
    </div>
  )
}
