import { useRef } from "react"
import { Link } from "react-router"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts"
import { useOverview, useSession, useSessions, useTimeline } from "@/lib/api"
import { StatTile } from "@/components/StatTile"
import { ContextBar } from "@/components/ContextBar"
import { EmptyState } from "@/components/EmptyState"
import { TickingNumber } from "@/components/TickingNumber"
import { Badge } from "@/components/ui/badge"
import { formatCost, formatNumber, formatRelativeTime, formatTokens } from "@/lib/format"
import { PageHeader } from "@/components/layout/PageHeader"
import { Sparkles } from "lucide-react"
import { prefersReducedMotion } from "@/lib/motion"

export default function Overview() {
  const { data: overview, isLoading } = useOverview()
  const { data: recent } = useSessions({ sort: "recency", order: "desc", limit: 8 })
  const { data: timeline } = useTimeline("day")
  const statGridRef = useRef<HTMLDivElement>(null)

  const topSession = recent?.items[0]

  useGSAP(
    () => {
      if (!statGridRef.current || prefersReducedMotion()) return
      gsap.from(statGridRef.current.children, { opacity: 0, y: 10, duration: 0.35, stagger: 0.05, ease: "power2.out" })
    },
    { dependencies: [!isLoading && !!overview], revertOnUpdate: true }
  )

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <PageHeader title="Overview" description="Every local Cursor session, chat, and token this machine knows about." />

      <div className="flex flex-col gap-6 px-6 pb-10 2xl:px-8">
        {!isLoading && overview && overview.sessionCount === 0 ? (
          <EmptyState
            title="No sessions yet"
            description="Open a chat in Cursor and it'll show up here automatically — cursor-dash watches your local data live."
            icon={<Sparkles className="size-8" />}
          />
        ) : (
          <>
            <div ref={statGridRef} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatTile
                label="Sessions"
                value={<TickingNumber value={overview?.sessionCount ?? 0} format={formatNumber} />}
                sub={`${overview?.activeSessionCount ?? 0} with messages`}
              />
              <StatTile
                label="Messages"
                value={<TickingNumber value={overview?.messageCount ?? 0} format={formatNumber} />}
                accent="iris"
              />
              <StatTile
                label="Tokens"
                value={<TickingNumber value={overview?.tokens.total ?? 0} format={formatTokens} />}
                accent="amber"
                sub={`${formatTokens(overview?.tokens.estimated ?? 0)} estimated`}
              />
              <StatTile
                label="Est. cost"
                value={<TickingNumber value={overview?.costUsd ?? 0} format={(n) => formatCost(n, overview?.unpricedTokens)} />}
                accent="mint"
                sub={overview?.unpricedTokens ? `${formatTokens(overview.unpricedTokens)} tok unpriced` : "all priced"}
              />
              <StatTile
                label="Lines changed"
                value={<TickingNumber value={overview?.linesAdded ?? 0} format={(n) => `+${formatNumber(n)}`} />}
                sub={`-${formatNumber(overview?.linesRemoved ?? 0)}`}
              />
              <StatTile
                label="Tool calls"
                value={<TickingNumber value={overview?.toolCallCount ?? 0} format={formatNumber} />}
                accent="coral"
                sub={`${overview?.toolCallErrorCount ?? 0} errors`}
              />
            </div>

            {timeline && timeline.length > 1 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Activity, last {timeline.length} active days</div>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeline} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--amber)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: "var(--foreground)" }}
                      />
                      <Area type="monotone" dataKey="tokens" stroke="var(--amber)" fill="url(#tokenFill)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_1fr]">
              <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Recent sessions</div>
                <ul>
                  {recent?.items.map((s) => (
                    <li key={s.id} className="border-b border-border last:border-0">
                      <Link to={`/sessions/${s.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{s.name || s.subtitle || "Untitled session"}</div>
                          <div className="truncate text-xs text-muted-foreground">{s.workspaceName || "no workspace"}</div>
                        </div>
                        <Badge variant={s.mode === "agent" ? "amber" : "iris"}>{s.mode}</Badge>
                        <span className="num w-20 shrink-0 text-right text-xs text-muted-foreground">{formatRelativeTime(s.lastUpdatedAt ?? s.createdAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {topSession && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <span>Context budget · most recent</span>
                    <Link to={`/sessions/${topSession.id}`} className="normal-case text-amber hover:underline">
                      {topSession.name || "view session"}
                    </Link>
                  </div>
                  <SessionContextPreview id={topSession.id} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SessionContextPreview({ id }: { id: string }) {
  const { data } = useSession(id)
  if (!data) return null
  return (
    <ContextBar
      categories={data.tokenBreakdown}
      usagePercent={data.contextUsagePercent}
      usedTokens={data.contextTokensUsed}
      limitTokens={data.contextTokenLimit}
      variant="full"
    />
  )
}
