import { Link } from "react-router"
import { useLiveState, useSession } from "@/lib/api"
import { LiveBadge } from "@/components/LiveBadge"

/** Sits in the top bar; only renders while something is actively
 * generating, and links straight to the /live page to watch it. */
export function LiveSessionPill() {
  const { data: live } = useLiveState()
  const sessionId = live?.isGenerating ? (live.sessionId ?? undefined) : undefined
  const { data: session } = useSession(sessionId)

  if (!live?.isGenerating || !live.sessionId) return null

  return (
    <Link
      to="/live"
      className="flex shrink-0 items-center gap-2 rounded-full px-1.5 py-1 transition-colors hover:bg-accent"
    >
      <LiveBadge />
      <span className="max-w-[10rem] truncate text-xs font-medium">
        {session?.name || session?.subtitle || "Generating…"}
      </span>
    </Link>
  )
}
