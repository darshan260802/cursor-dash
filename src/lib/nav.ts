import type { LucideIcon } from "lucide-react"
import { Gauge, MessagesSquare, BarChart3, Sparkles, FolderGit2, Radio, Share2 } from "lucide-react"

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end: boolean
  // Rendered before this item, visually grouping it apart from what came
  // before — currently just Share, set off from the rest under Workspaces.
  dividerBefore?: boolean
  // Hidden for a request that came in through a `--share` tunnel (see
  // Meta.isOwner) — cosmetic only, the server enforces the real
  // restriction on /api/share/* independently.
  ownerOnly?: boolean
}

export const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: Gauge, end: true },
  { to: "/live", label: "Live", icon: Radio, end: false },
  { to: "/sessions", label: "Sessions", icon: MessagesSquare, end: false },
  { to: "/analytics", label: "Analytics", icon: BarChart3, end: false },
  { to: "/code-authorship", label: "Code authorship", icon: Sparkles, end: false },
  { to: "/workspaces", label: "Workspaces", icon: FolderGit2, end: false },
  { to: "/share", label: "Share", icon: Share2, end: false, dividerBefore: true, ownerOnly: true },
]
