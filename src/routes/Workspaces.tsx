import { Link } from "react-router"
import { useWorkspaces } from "@/lib/api"
import { PageHeader } from "@/components/layout/PageHeader"
import { EmptyState } from "@/components/EmptyState"
import { formatCost, formatNumber, formatTokens } from "@/lib/format"
import { FolderGit2, Folder } from "lucide-react"

export default function Workspaces() {
  const { data, isLoading } = useWorkspaces()

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <PageHeader title="Workspaces" description="Every project folder Cursor has run a session in on this machine." />

      <div className="flex flex-col gap-3 px-6 pb-10 2xl:px-8">
        {!isLoading && (!data || data.length === 0) ? (
          <EmptyState title="No workspaces found" icon={<Folder className="size-8" />} />
        ) : (
          data?.map((w) => (
            <div key={w.workspaceId} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
              <FolderGit2 className="size-5 shrink-0 text-iris" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{w.folderName || "Untitled workspace"}</div>
                <div className="truncate text-xs text-muted-foreground" title={w.folderPath ?? undefined}>
                  {w.folderPath || "no folder path recorded"}
                </div>
              </div>
              <div className="num flex shrink-0 items-center gap-5 text-sm">
                <Stat label="sessions" value={formatNumber(w.sessionCount)} />
                <Stat label="tokens" value={formatTokens(w.tokens)} />
                <Stat label="cost" value={formatCost(w.costUsd)} />
              </div>
              <Link
                to={`/sessions?workspace=${encodeURIComponent(w.workspaceId)}`}
                className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                View sessions
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="font-medium">{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
    </div>
  )
}
