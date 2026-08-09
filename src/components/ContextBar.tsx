// The dashboard's signature element. Cursor already measures what's
// competing for a session's context window — system prompt, tools, rules,
// skills, MCP, subagents, summarized history, and the live conversation —
// and exposes it nowhere. This renders that budget as one stacked meter,
// at three scales: a 3px thread in each session row, the full labelled
// stack in a session's header, and a small-multiples grid in Analytics.

import { useId } from "react"
import type { ContextCategory } from "@/lib/types"
import { formatPercent, formatTokens } from "@/lib/format"
import { cn } from "@/lib/utils"

function categoryColor(index: number, total: number) {
  const t = total <= 1 ? 0 : index / (total - 1)
  const amberPct = Math.round(t * 100)
  return `color-mix(in oklab, var(--amber) ${amberPct}%, var(--iris) ${100 - amberPct}%)`
}

interface ContextBarProps {
  categories: ContextCategory[]
  usagePercent: number | null
  usedTokens?: number | null
  limitTokens?: number | null
  variant?: "sparkline" | "full" | "grid"
  name?: string
  className?: string
}

export function ContextBar({
  categories,
  usagePercent,
  usedTokens,
  limitTokens,
  variant = "sparkline",
  name,
  className,
}: ContextBarProps) {
  const gradientId = useId()
  const total = categories.reduce((n, c) => n + (c.estimatedTokens || 0), 0)
  const pct = usagePercent ?? 0
  const clamped = Math.max(0, Math.min(100, pct))
  const hasData = categories.length > 0 && total > 0

  const segments = hasData
    ? categories.map((c, i) => ({
        ...c,
        color: categoryColor(i, categories.length),
        widthPct: (c.estimatedTokens / total) * clamped,
      }))
    : []

  if (variant === "sparkline") {
    return (
      <div
        className={cn("h-[3px] w-full overflow-hidden rounded-full bg-border/70", className)}
        title={hasData ? `${formatPercent(pct)} of context window` : "No context data"}
      >
        {hasData && (
          <div className="flex h-full w-full">
            {segments.map((s) => (
              <div key={s.id} style={{ width: `${s.widthPct}%`, background: s.color }} className="h-full" />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (variant === "grid") {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <div className="flex items-baseline justify-between gap-2">
          {name && <span className="truncate text-xs text-muted-foreground">{name}</span>}
          <span className="num shrink-0 text-xs font-medium">{formatPercent(pct)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-border/70">
          {hasData && (
            <div className="flex h-full w-full" id={gradientId}>
              {segments.map((s) => (
                <div
                  key={s.id}
                  style={{ width: `${s.widthPct}%`, background: s.color }}
                  className="h-full"
                  title={`${s.label}: ${formatTokens(s.estimatedTokens)} tok`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // variant === "full"
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-end justify-between">
        <div className="font-heading text-2xl font-medium tabular-nums">
          {formatPercent(pct, 1)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">of context window</span>
        </div>
        {usedTokens != null && limitTokens != null && (
          <div className="num text-xs text-muted-foreground">
            {formatTokens(usedTokens)} / {formatTokens(limitTokens)} tok
          </div>
        )}
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-border/70">
        {hasData && (
          <div className="flex h-full w-full">
            {segments.map((s) => (
              <div key={s.id} style={{ width: `${s.widthPct}%`, background: s.color }} className="h-full first:rounded-l-full" />
            ))}
          </div>
        )}
      </div>
      {hasData && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
          {categories.map((c, i) => (
            <div key={c.id} className="flex items-center gap-1.5 text-xs">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: categoryColor(i, categories.length) }}
                aria-hidden
              />
              <dt className="truncate text-muted-foreground">{c.label}</dt>
              <dd className="num ml-auto shrink-0 font-medium">{formatTokens(c.estimatedTokens)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
