import { useRef, useState, type ReactNode } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { ChevronRight, CheckCircle2, XCircle, CircleDashed } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/format"
import { DURATION, EASE, prefersReducedMotion } from "@/lib/motion"

const STATUS_ICON: Record<string, ReactNode> = {
  completed: <CheckCircle2 className="size-3.5 text-mint" />,
  error: <XCircle className="size-3.5 text-coral" />,
}

/** Shared chrome for every tool card: icon, name, one-line summary,
 * status, duration, and an expand/collapse GSAP height tween. Individual
 * cards (EditToolCard, TerminalToolCard, …) only supply the icon, header
 * summary, and expanded content — this keeps their visual rhythm identical. */
export function ToolCardShell({
  icon,
  title,
  summary,
  status,
  durationMs,
  defaultOpen = false,
  children,
}: {
  icon: ReactNode
  title: string
  summary?: ReactNode
  status: string
  durationMs?: number | null
  defaultOpen?: boolean
  children?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const contentRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    const el = contentRef.current
    const inner = innerRef.current
    if (!el || !inner || !children) return
    if (prefersReducedMotion()) {
      el.style.height = open ? "auto" : "0px"
      return
    }
    if (open) {
      const target = inner.offsetHeight
      gsap.fromTo(
        el,
        { height: 0 },
        { height: target, duration: DURATION.base, ease: EASE.out, onComplete: () => (el.style.height = "auto") }
      )
    } else {
      gsap.to(el, { height: 0, duration: DURATION.base, ease: EASE.out })
    }
  }, [open])

  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => children && setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted/60",
          !children && "cursor-default"
        )}
      >
        {children ? (
          <ChevronRight className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <span className="shrink-0 text-iris">{icon}</span>
        <span className="num shrink-0 font-medium">{title}</span>
        {summary && <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary}</span>}
        {durationMs != null && <span className="num shrink-0 text-[10px] text-muted-foreground">{formatDuration(durationMs)}</span>}
        <span className="shrink-0">{STATUS_ICON[status] ?? <CircleDashed className="size-3.5 text-muted-foreground" />}</span>
      </button>
      {children && (
        <div ref={contentRef} style={{ height: 0, overflow: "hidden" }}>
          <div ref={innerRef} className="flex flex-col gap-2 border-t border-border p-2">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
