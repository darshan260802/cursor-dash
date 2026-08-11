import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { Search, X } from "lucide-react"
import { useSearch } from "@/lib/api"
import { formatRelativeTime } from "@/lib/format"
import { prefersReducedMotion, DURATION, EASE } from "@/lib/motion"
import { cn } from "@/lib/utils"

/** Quick session lookup across every workspace — wraps the existing
 * `/api/search` (FTS with a linear-scan fallback) in a small dropdown. */
export function GlobalSearch() {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const { data: results } = useSearch(q)
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const showPanel = open && q.length > 1

  useGSAP(() => {
    if (!panelRef.current) return
    if (showPanel) {
      if (prefersReducedMotion()) {
        gsap.set(panelRef.current, { opacity: 1, y: 0 })
        return
      }
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: -6 },
        { opacity: 1, y: 0, duration: DURATION.fast, ease: EASE.out }
      )
    }
  }, [showPanel])

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickAway)
    return () => document.removeEventListener("mousedown", onClickAway)
  }, [])

  function go(id: string) {
    navigate(`/sessions/${id}`)
    setOpen(false)
    setQ("")
    inputRef.current?.blur()
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="flex h-8 items-center gap-2 rounded-2xl border border-transparent bg-input/50 px-2.5 transition-[color,box-shadow] duration-200 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false)
              inputRef.current?.blur()
            }
          }}
          placeholder="Search sessions…"
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {showPanel && (
        <div
          ref={panelRef}
          className="absolute top-[calc(100%+6px)] left-0 z-50 max-h-80 w-full overflow-y-auto scrollbar-thin rounded-lg border border-border bg-popover shadow-lg"
        >
          {!results || results.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">No matching sessions</div>
          ) : (
            <ul className="py-1">
              {results.slice(0, 20).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => go(r.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{r.title || "Untitled session"}</span>
                    <span className="num shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTime(r.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
