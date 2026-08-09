import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface StatTileProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: "amber" | "mint" | "coral" | "iris" | "none"
  className?: string
}

const accentClass: Record<NonNullable<StatTileProps["accent"]>, string> = {
  amber: "text-amber",
  mint: "text-mint",
  coral: "text-coral",
  iris: "text-iris",
  none: "text-foreground",
}

export function StatTile({ label, value, sub, accent = "none", className }: StatTileProps) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4", className)}>
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className={cn("font-heading num text-[1.75rem] leading-none font-medium", accentClass[accent])}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}
