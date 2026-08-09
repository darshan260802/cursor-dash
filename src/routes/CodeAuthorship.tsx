import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { useAiTracking } from "@/lib/api"
import { PageHeader } from "@/components/layout/PageHeader"
import { EmptyState } from "@/components/EmptyState"
import { StatTile } from "@/components/StatTile"
import { formatNumber, formatDate } from "@/lib/format"
import { GitCommitVertical, Sparkles } from "lucide-react"

export default function CodeAuthorship() {
  const { data, isLoading } = useAiTracking()

  const commits = data?.commits ?? []
  const totals = commits.reduce(
    (acc, c) => {
      acc.ai += c.composerLinesAdded + c.tabLinesAdded
      acc.human += c.humanLinesAdded
      return acc
    },
    { ai: 0, human: 0 }
  )
  const aiPercent = totals.ai + totals.human > 0 ? (totals.ai / (totals.ai + totals.human)) * 100 : null

  const chartData = [...commits]
    .slice(0, 20)
    .reverse()
    .map((c) => ({
      commit: c.commitHash.slice(0, 7),
      ai: c.composerLinesAdded + c.tabLinesAdded,
      human: c.humanLinesAdded,
    }))

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <PageHeader title="Code authorship" description="How much of your codebase Cursor wrote, tracked per commit and per generated file." />

      <div className="flex flex-col gap-6 px-6 pb-10 2xl:px-8">
        {!isLoading && !data ? (
          <EmptyState
            title="No AI-tracking data found"
            description="Cursor writes this to ~/.cursor/ai-tracking/ai-code-hashes.db once it starts scoring commits in a git repo."
            icon={<Sparkles className="size-8" />}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Scored commits" value={formatNumber(commits.length)} />
              <StatTile label="AI-authored lines" value={formatNumber(totals.ai)} accent="amber" />
              <StatTile label="Human-authored lines" value={formatNumber(totals.human)} accent="iris" />
              <StatTile label="AI share" value={aiPercent != null ? `${aiPercent.toFixed(0)}%` : "—"} accent="mint" />
            </div>

            {chartData.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Lines added per commit, AI vs human</div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="commit" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="ai" stackId="a" fill="var(--amber)" radius={[0, 0, 0, 0]} name="AI" />
                      <Bar dataKey="human" stackId="a" fill="var(--iris)" radius={[3, 3, 0, 0]} name="Human" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Recent commits</div>
                {commits.length === 0 ? (
                  <EmptyState title="No commits scored yet" icon={<GitCommitVertical className="size-6" />} className="border-none py-8" />
                ) : (
                  <ul>
                    {commits.slice(0, 12).map((c) => (
                      <li key={c.commitHash + c.branchName} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                        <span className="num shrink-0 text-xs text-muted-foreground">{c.commitHash.slice(0, 7)}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{c.commitMessage || "(no message)"}</span>
                        <span className="num shrink-0 text-xs text-muted-foreground">{formatDate(c.commitDate)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">By file extension</div>
                {!data?.fileExtensionBreakdown.length ? (
                  <EmptyState title="No file data yet" className="border-none py-8" />
                ) : (
                  <ul>
                    {data.fileExtensionBreakdown.slice(0, 12).map((f) => (
                      <li key={f.extension} className="flex items-center justify-between border-b border-border px-4 py-2.5 last:border-0 text-sm">
                        <span className="num">.{f.extension}</span>
                        <span className="num text-muted-foreground">{formatNumber(f.count)} generations</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
