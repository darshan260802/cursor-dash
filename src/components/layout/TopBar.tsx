import type { ReactNode } from "react"
import { useLocation } from "react-router"
import { Wifi, WifiOff } from "lucide-react"
import { NAV } from "@/lib/nav"
import { cn } from "@/lib/utils"
import type { LiveConnectionStatus } from "@/lib/api"
import { GlobalSearch } from "@/components/GlobalSearch"
import { RefreshButton } from "@/components/RefreshButton"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

const STATUS_LABEL: Record<LiveConnectionStatus, string> = {
  connecting: "Connecting to live updates…",
  connected: "Live updates connected",
  reconnecting: "Reconnecting to live updates…",
}

const STATUS_DOT: Record<LiveConnectionStatus, string> = {
  connecting: "bg-muted-foreground",
  connected: "bg-mint",
  reconnecting: "bg-amber animate-pulse",
}

/** Persistent bar above every route: current page, global search, live
 * connection state, and the manual refresh escape hatch. */
export function TopBar({ status, liveSlot }: { status: LiveConnectionStatus; liveSlot?: ReactNode }) {
  const location = useLocation()
  const current = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border px-4 2xl:px-6">
      <h1 className="font-heading shrink-0 text-sm font-semibold tracking-tight">{current?.label ?? "Cursor Dash"}</h1>

      <div className="flex-1" />

      <GlobalSearch />

      {liveSlot}

      <Tooltip>
        <TooltipTrigger>
          <span className={cn("flex size-2.5 items-center justify-center rounded-full", STATUS_DOT[status])} aria-hidden />
        </TooltipTrigger>
        <TooltipContent>
          {status === "connected" ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
          {STATUS_LABEL[status]}
        </TooltipContent>
      </Tooltip>

      <RefreshButton />
    </header>
  )
}
