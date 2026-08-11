import { Gauge, MessagesSquare, BarChart3, Sparkles, FolderGit2, Radio } from "lucide-react"

export const NAV = [
  { to: "/", label: "Overview", icon: Gauge, end: true },
  { to: "/live", label: "Live", icon: Radio, end: false },
  { to: "/sessions", label: "Sessions", icon: MessagesSquare, end: false },
  { to: "/analytics", label: "Analytics", icon: BarChart3, end: false },
  { to: "/code-authorship", label: "Code authorship", icon: Sparkles, end: false },
  { to: "/workspaces", label: "Workspaces", icon: FolderGit2, end: false },
] as const
