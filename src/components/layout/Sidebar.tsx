import { NavLink } from "react-router"
import { Moon, Sun, CircleDot } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "@/lib/theme"
import { useMeta } from "@/lib/api"
import { NAV } from "@/lib/nav"
import { PricingSettings } from "@/components/PricingSettings"
import { AboutModal } from "@/components/AboutModal"

export function Sidebar() {
  const { theme, toggle } = useTheme()
  const { data: meta } = useMeta({ refetchInterval: 30_000 })
  const healthy = meta?.sourceHealth.filter((s) => s.ok).length ?? 0
  const total = meta?.sourceHealth.length ?? 0

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border 2xl:w-64">
      <div className="flex items-center gap-2 px-4 py-5">
        <img src="/logo.png" alt="" className="size-7 shrink-0 rounded-md object-cover" />
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
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                isActive && "bg-accent text-foreground"
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
        <AboutModal />
      </div>
    </aside>
  )
}
