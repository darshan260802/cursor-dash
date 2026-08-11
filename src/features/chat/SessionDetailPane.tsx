import { useMemo, useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ContextBar } from "@/components/ContextBar"
import { StatTile } from "@/components/StatTile"
import { LiveBadge } from "@/components/LiveBadge"
import { ChatView } from "./ChatView"
import { ChangesTab } from "./ChangesTab"
import { ContextTab } from "./ContextTab"
import { CodeBlock } from "./CodeBlock"
import { useLiveState, useSession, useSessionMessages, useTranscriptOutcome, sessionExportUrl } from "@/lib/api"
import { formatCost, formatDuration, formatNumber, formatTokens } from "@/lib/format"
import { Download, FileText, CheckSquare, Square, X } from "lucide-react"
import { Link } from "react-router"
import { EmptyState } from "@/components/EmptyState"

export function SessionDetailPane({ id }: { id: string }) {
  const { data: session, isLoading } = useSession(id)
  const { data: messagesPage } = useSessionMessages(id)
  const { data: outcome } = useTranscriptOutcome(id)
  const { data: live } = useLiveState()
  const isLive = live?.isGenerating && live.sessionId === id
  const [tab, setTab] = useState("chat")

  const toolCounts = useMemo(() => {
    if (!messagesPage) return []
    const map = new Map<string, { name: string; count: number; errorCount: number }>()
    for (const m of messagesPage.items) {
      for (const t of m.toolCalls) {
        if (!map.has(t.name)) map.set(t.name, { name: t.name, count: 0, errorCount: 0 })
        const e = map.get(t.name)!
        e.count++
        if (t.status === "error") e.errorCount++
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [messagesPage])

  if (isLoading || !session) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading session…</div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={session.mode === "agent" ? "amber" : "iris"}>{session.mode}</Badge>
            {session.status && <Badge variant="outline">{session.status}</Badge>}
            {outcome?.status === "error" && <Badge variant="coral">agent error</Badge>}
            {isLive && <LiveBadge />}
          </div>
          <h2 className="mt-1 truncate font-heading text-lg font-medium">{session.name || session.subtitle || "Untitled session"}</h2>
          {session.workspacePath && (
            <p className="truncate text-xs text-muted-foreground" title={session.workspacePath}>
              {session.workspacePath}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link to={`/sessions`} className="lg:hidden">
            <Button variant="ghost" size="icon-sm">
              <X className="size-4" />
            </Button>
          </Link>
          <a href={sessionExportUrl(id, "md")} download>
            <Button variant="outline" size="sm">
              <FileText className="size-3.5" /> .md
            </Button>
          </a>
          <a href={sessionExportUrl(id, "json")} download>
            <Button variant="outline" size="sm">
              <Download className="size-3.5" /> .json
            </Button>
          </a>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-4 mt-2 self-start" variant="line">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="changes">Changes ({session.fileChanges.length})</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="context">Context</TabsTrigger>
          <TabsTrigger value="tools">Tools ({toolCounts.length})</TabsTrigger>
          <TabsTrigger value="raw">Raw</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="min-h-0">
          <ChatView key={id} messages={messagesPage?.items ?? []} />
        </TabsContent>

        <TabsContent value="changes" className="scrollbar-thin min-h-0 overflow-y-auto px-4 py-4">
          <ChangesTab sessionId={id} />
        </TabsContent>

        <TabsContent value="metrics" className="scrollbar-thin min-h-0 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-6">
            <ContextBar
              categories={session.tokenBreakdown}
              usagePercent={session.contextUsagePercent}
              usedTokens={session.contextTokensUsed}
              limitTokens={session.contextTokenLimit}
              variant="full"
            />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Tokens" value={formatTokens(session.tokens.total)} accent="amber" />
              <StatTile label="Est. cost" value={formatCost(session.cost.usd, session.cost.unpricedTokens)} accent="mint" />
              <StatTile label="Duration" value={formatDuration(session.durationMs)} />
              <StatTile label="Tool calls" value={formatNumber(session.toolCallCount)} sub={`${session.toolCallErrorCount} errors`} accent="coral" />
            </div>
            {session.todos.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Todos</div>
                <ul className="flex flex-col gap-1.5">
                  {session.todos.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      {t.status === "completed" ? <CheckSquare className="size-3.5 text-mint" /> : <Square className="size-3.5 text-muted-foreground" />}
                      <span className={t.status === "completed" ? "text-muted-foreground line-through" : ""}>{t.content}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="context" className="scrollbar-thin min-h-0 overflow-y-auto px-4 py-4">
          <ContextTab session={session} />
        </TabsContent>

        <TabsContent value="tools" className="scrollbar-thin min-h-0 overflow-y-auto px-4 py-4">
          {toolCounts.length === 0 ? (
            <EmptyState title="No tool calls" description="This session didn't invoke any tools." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Tool</th>
                  <th className="pb-2 font-medium">Calls</th>
                  <th className="pb-2 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {toolCounts.map((t) => (
                  <tr key={t.name} className="border-b border-border last:border-0">
                    <td className="num py-1.5">{t.name}</td>
                    <td className="num py-1.5">{t.count}</td>
                    <td className="num py-1.5 text-coral">{t.errorCount || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        <TabsContent value="raw" className="scrollbar-thin min-h-0 overflow-y-auto px-4 py-4">
          <CodeBlock code={JSON.stringify(session, null, 2)} lang="json" maxHeight={2000} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
