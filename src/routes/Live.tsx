import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router"
import { Activity, CheckSquare, Hourglass, Square, Timer } from "lucide-react"
import { useLiveState, useSession, useSessionMessages, useSessions } from "@/lib/api"
import { PageHeader } from "@/components/layout/PageHeader"
import { EmptyState } from "@/components/EmptyState"
import { LiveBadge } from "@/components/LiveBadge"
import { ChatView } from "@/features/chat/ChatView"
import { ContextBar } from "@/components/ContextBar"
import { TickingNumber } from "@/components/TickingNumber"
import { Badge } from "@/components/ui/badge"
import { formatCost, formatDuration, formatTokens } from "@/lib/format"

function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return startedAt ? now - startedAt : null
}

export default function Live() {
  const { data: live, isLoading: liveLoading } = useLiveState()
  const { data: recent } = useSessions({ sort: "recency", order: "desc", limit: 1 })
  const sessionId = live?.sessionId ?? undefined
  const { data: session } = useSession(sessionId)
  const { data: messagesPage } = useSessionMessages(sessionId)
  const elapsed = useElapsed(live?.isGenerating ? live.startedAt : null)

  if (!liveLoading && !sessionId) {
    const fallback = recent?.items[0]
    return (
      <div className="scrollbar-thin h-full overflow-y-auto">
        <PageHeader title="Live" description="Watch an agent session as it runs, in real time." />
        <div className="px-6 pb-10 2xl:px-8">
          <EmptyState
            title="Nothing running right now"
            description="Start a chat or agent turn in Cursor and it'll show up here automatically, live — no restart needed."
            icon={<Activity className="size-8" />}
            action={
              fallback && (
                <Link to={`/sessions/${fallback.id}`} className="text-xs text-amber hover:underline">
                  View most recent session — {fallback.name || fallback.subtitle || "Untitled session"}
                </Link>
              )
            }
          />
        </div>
      </div>
    )
  }

  if (!session) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading live session…</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={session.mode === "agent" ? "amber" : "iris"}>{session.mode}</Badge>
            {live?.isGenerating ? <LiveBadge /> : <Badge variant="outline">idle</Badge>}
            {session.model && <span className="num text-xs text-muted-foreground">{session.model}</span>}
          </div>
          <h2 className="mt-1 truncate font-heading text-lg font-medium">
            {session.name || session.subtitle || "Untitled session"}
          </h2>
          {session.workspacePath && (
            <p className="truncate text-xs text-muted-foreground" title={session.workspacePath}>
              {session.workspacePath}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Metric icon={<Timer className="size-3.5" />} label="elapsed" value={elapsed != null ? formatDuration(elapsed) : "—"} />
          <Metric
            icon={<Hourglass className="size-3.5" />}
            label="tokens"
            value={<TickingNumber value={session.tokens.total} format={formatTokens} />}
          />
          <Metric
            label="cost"
            value={<TickingNumber value={session.cost.usd} format={(n) => formatCost(n, session.cost.unpricedTokens)} />}
          />
        </div>
      </div>

      <div className="border-b border-border px-4 py-3">
        <ContextBar
          categories={session.tokenBreakdown}
          usagePercent={session.contextUsagePercent}
          usedTokens={session.contextTokensUsed}
          limitTokens={session.contextTokenLimit}
          variant="full"
        />
      </div>

      {(session.todos.length > 0 || session.queuedPrompts.length > 0) && (
        <div className="flex flex-wrap gap-6 border-b border-border px-4 py-3">
          {session.todos.length > 0 && (
            <div className="min-w-48 flex-1">
              <div className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Todos</div>
              <ul className="flex flex-col gap-1">
                {session.todos.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-xs">
                    {t.status === "completed" ? (
                      <CheckSquare className="size-3 shrink-0 text-mint" />
                    ) : (
                      <Square className="size-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className={t.status === "completed" ? "truncate text-muted-foreground line-through" : "truncate"}>
                      {t.content}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {session.queuedPrompts.length > 0 && (
            <div className="min-w-48 flex-1">
              <div className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Queued ({session.queuedPrompts.length})
              </div>
              <ul className="flex flex-col gap-1">
                {session.queuedPrompts.map((p) => (
                  <li key={p.id} className="truncate text-xs text-muted-foreground">
                    {p.text || "…"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <ChatView key={sessionId} messages={messagesPage?.items ?? []} live />
      </div>
    </div>
  )
}

function Metric({ icon, label, value }: { icon?: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="flex items-center gap-1 text-[10px] tracking-wide text-muted-foreground uppercase">
        {icon}
        {label}
      </span>
      <span className="num text-sm font-medium">{value}</span>
    </div>
  )
}
