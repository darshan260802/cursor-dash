import { useRef, useState } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { BrainCircuit, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { DURATION, EASE, prefersReducedMotion } from "@/lib/motion"

export function ThinkingBlock({ text, durationMs }: { text: string; durationMs: number }) {
  const [open, setOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLParagraphElement>(null)
  // See ToolCardShell's identical guard: this block mounts/unmounts every
  // time it scrolls in and out of view inside the virtualized chat, so
  // only a real user toggle should animate — not every remount.
  const hasMountedRef = useRef(false)

  useGSAP(() => {
    const el = contentRef.current
    const inner = innerRef.current
    if (!el || !inner) return
    const skipAnimation = !hasMountedRef.current || prefersReducedMotion()
    hasMountedRef.current = true
    if (skipAnimation) {
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
    <div className="overflow-hidden rounded-md border border-iris/25 bg-iris/5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-iris hover:bg-iris/10"
      >
        <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
        <BrainCircuit className="size-3 shrink-0" />
        <span>Thinking</span>
        <span className="num ml-auto shrink-0 text-muted-foreground">
          {(durationMs / 1000).toFixed(durationMs < 1000 ? 3 : 1)}s
        </span>
      </button>
      <div ref={contentRef} style={{ height: 0, overflow: "hidden" }}>
        <p ref={innerRef} className="border-t border-iris/20 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {text}
        </p>
      </div>
    </div>
  )
}
