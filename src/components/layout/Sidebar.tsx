import { NavLink } from "react-router"
import { Gauge, MessagesSquare, BarChart3, Sparkles, FolderGit2, Moon, Sun, CircleDot } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "@/lib/theme"
import { useMeta } from "@/lib/api"
import { formatRelativeTime } from "@/lib/format"
import { PricingSettings } from "@/components/PricingSettings"

const NAV = [
  { to: "/", label: "Overview", icon: Gauge, end: true },
  { to: "/sessions", label: "Sessions", icon: MessagesSquare },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/code-authorship", label: "Code authorship", icon: Sparkles },
  { to: "/workspaces", label: "Workspaces", icon: FolderGit2 },
]

export function Sidebar() {
  const { theme, toggle } = useTheme()
  const { data: meta } = useMeta({ refetchInterval: 30_000 })
  const healthy = meta?.sourceHealth.filter((s) => s.ok).length ?? 0
  const total = meta?.sourceHealth.length ?? 0

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-sidebar 2xl:w-64">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex size-7 items-center justify-center rounded-md bg-amber font-heading text-sm font-bold text-primary-foreground">
          C
        </div>
        <span className="font-heading text-base font-semibold tracking-tight">Cursor Dash</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                isActive && "bg-sidebar-accent text-foreground"
              )
            }
          >
            <Icon className="size-4" strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-2 border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CircleDot className={cn("size-3", healthy === total && total > 0 ? "text-mint" : "text-coral")} />
          <span className="num">
            {healthy}/{total} sources
          </span>
          <span className="ml-auto num">{formatRelativeTime(meta?.lastRefreshedAt ?? null)}</span>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <PricingSettings />
      </div>
    </aside>
  )
}
