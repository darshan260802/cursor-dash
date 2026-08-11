import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { SpotlightCard } from "@/components/ui/spotlight-card"

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

const accentSpotlight: Record<NonNullable<StatTileProps["accent"]>, string> = {
  amber: "color-mix(in oklab, var(--amber) 35%, transparent)",
  mint: "color-mix(in oklab, var(--mint) 35%, transparent)",
  coral: "color-mix(in oklab, var(--coral) 35%, transparent)",
  iris: "color-mix(in oklab, var(--iris) 35%, transparent)",
  none: "color-mix(in oklab, var(--foreground) 12%, transparent)",
}

export function StatTile({ label, value, sub, accent = "none", className }: StatTileProps) {
  return (
    <SpotlightCard
      spotlightColor={accentSpotlight[accent]}
      className={cn("flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4", className)}
    >
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className={cn("font-heading num text-[1.75rem] leading-none font-medium", accentClass[accent])}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </SpotlightCard>
  )
}
