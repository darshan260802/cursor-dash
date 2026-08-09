import { useState } from "react"
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts"
import { useContextPressure, useModelBreakdown, useTimeline, useToolBreakdown } from "@/lib/api"
import { PageHeader } from "@/components/layout/PageHeader"
import { ContextBar } from "@/components/ContextBar"
import { EmptyState } from "@/components/EmptyState"
import { formatCost, formatNumber, formatTokens } from "@/lib/format"
import { BarChart3 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const SERIES = [
  { key: "tokens", label: "Tokens", color: "var(--amber)", format: formatTokens },
  { key: "costUsd", label: "Est. cost", color: "var(--mint)", format: (n: number) => formatCost(n) },
  { key: "sessions", label: "Sessions", color: "var(--iris)", format: formatNumber },
  { key: "messages", label: "Messages", color: "var(--coral)", format: formatNumber },
] as const

const CATEGORY_COLORS = ["var(--amber)", "var(--mint)", "var(--coral)", "var(--iris)", "#8B849C", "#C97B2E", "#5FD3A6", "#F2668B"]

export default function Analytics() {
  const [unit, setUnit] = useState<"day" | "week">("day")
  const [metric, setMetric] = useState<(typeof SERIES)[number]["key"]>("tokens")
  const { data: timeline } = useTimeline(unit)
  const { data: models } = useModelBreakdown()
  const { data: tools } = useToolBreakdown()
  const { data: context } = useContextPressure()

  const activeSeries = SERIES.find((s) => s.key === metric)!

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <PageHeader title="Analytics" description="Usage over time, model mix, tool behavior, and context pressure across every session." />

      <div className="flex flex-col gap-6 px-6 pb-10 2xl:px-8">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {SERIES.map((s) => (
              <button
                key={s.key}
                onClick={() => setMetric(s.key)}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                style={{
                  borderColor: metric === s.key ? s.color : "var(--border)",
                  color: metric === s.key ? s.color : "var(--muted-foreground)",
                  background: metric === s.key ? `color-mix(in oklab, ${s.color} 12%, transparent)` : "transparent",
                }}
              >
                {s.label}
              </button>
            ))}
            <Select value={unit} onValueChange={(v) => setUnit(v as "day" | "week")}>
              <SelectTrigger size="sm" className="ml-auto h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="week">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!timeline || timeline.length === 0 ? (
            <EmptyState title="No activity yet" icon={<BarChart3 className="size-8" />} className="border-none py-10" />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={activeSeries.color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={activeSeries.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "var(--foreground)" }}
                    formatter={(v) => activeSeries.format(Number(v))}
                  />
                  <Area type="monotone" dataKey={activeSeries.key} stroke={activeSeries.color} fill="url(#metricFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Model mix</div>
            {!models || models.length === 0 ? (
              <EmptyState title="No model data" className="border-none py-8" />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={models} layout="vertical" margin={{ left: 8, right: 16 }} barSize={22}>
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={formatTokens} />
                    <YAxis
                      dataKey="model"
                      type="category"
                      width={110}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v, key) => (key === "usd" ? formatCost(Number(v)) : formatTokens(Number(v)))}
                    />
                    <Bar dataKey="inputTokens" stackId="tok" fill="var(--iris)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="outputTokens" stackId="tok" fill="var(--amber)" radius={[0, 4, 4, 0]}>
                      {models.map((m, i) => (
                        <Cell key={i} fillOpacity={m.priced ? 1 : 0.5} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Tool usage</div>
            {!tools || tools.length === 0 ? (
              <EmptyState title="No tool calls" className="border-none py-8" />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tools.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 16 }} barSize={22}>
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {tools.slice(0, 10).map((t, i) => (
                        <Cell key={t.name} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Context budget by session</div>
          {!context || context.length === 0 ? (
            <EmptyState title="No context data yet" className="border-none py-8" />
          ) : (
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
              {context.map((c) => (
                <ContextBar key={c.id} name={c.name} categories={c.categories} usagePercent={c.contextUsagePercent} variant="grid" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
