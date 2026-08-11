import { useEffect, useRef, useState } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { RefreshCw } from "lucide-react"
import { useMeta, useRefreshAll } from "@/lib/api"
import { formatRelativeTime } from "@/lib/format"
import { DURATION, EASE, prefersReducedMotion } from "@/lib/motion"

/** The escape hatch for "restart the process to see fresh data": forces a
 * full server-side re-snapshot + re-read, then invalidates every query. */
export function RefreshButton() {
  const { data: meta } = useMeta({ refetchInterval: 30_000 })
  const refresh = useRefreshAll()
  const iconRef = useRef<SVGSVGElement>(null)
  const spinTween = useRef<gsap.core.Tween | null>(null)

  // "Updated Xs ago" drifts stale without its own tick — nothing else
  // re-renders this component on that cadence.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 5000)
    return () => clearInterval(id)
  }, [])

  useGSAP(() => {
    if (!iconRef.current || prefersReducedMotion()) return
    if (refresh.isPending) {
      spinTween.current = gsap.to(iconRef.current, { rotate: 360, duration: 0.7, ease: "none", repeat: -1 })
    } else {
      spinTween.current?.kill()
      spinTween.current = null
      gsap.set(iconRef.current, { rotate: 0 })
      if (refresh.isSuccess) {
        gsap.fromTo(
          iconRef.current,
          { scale: 1 },
          { scale: 1.25, duration: DURATION.fast, ease: EASE.back, yoyo: true, repeat: 1 }
        )
      }
    }
  }, [refresh.isPending])

  return (
    <button
      type="button"
      onClick={() => refresh.mutate()}
      disabled={refresh.isPending}
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70"
      title="Refresh now — re-reads Cursor's local data from disk"
    >
      <RefreshCw ref={iconRef} className="size-3.5" />
      <span className="num whitespace-nowrap">
        {refresh.isPending ? "Refreshing…" : `Updated ${formatRelativeTime(meta?.lastRefreshedAt ?? null)}`}
      </span>
    </button>
  )
}
