import { useRef } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { prefersReducedMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

/** A breathing "LIVE" pill — the one visual signal Cursor itself never
 * shows: that a session is actively generating right now. */
export function LiveBadge({ className }: { className?: string }) {
  const dotRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  useGSAP(() => {
    if (prefersReducedMotion()) return
    const tl = gsap.timeline({ repeat: -1 })
    if (dotRef.current) {
      tl.to(dotRef.current, { scale: 1.6, opacity: 0.4, duration: 0.7, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0)
    }
    // A metallic sheen sweeping across the label — background-position on a
    // gradient clipped to the text, the classic "shiny text" trick.
    if (textRef.current) {
      tl.fromTo(textRef.current, { backgroundPosition: "200% 0" }, { backgroundPosition: "-200% 0", duration: 2.2, ease: "none" }, 0)
    }
    return () => {
      tl.kill()
    }
  }, [])

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-coral/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        className
      )}
    >
      <span ref={dotRef} className="size-1.5 shrink-0 rounded-full bg-coral" aria-hidden />
      <span
        ref={textRef}
        className="bg-clip-text text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(110deg, var(--coral) 40%, color-mix(in oklab, var(--coral) 40%, white) 50%, var(--coral) 60%)",
          backgroundSize: "300% 100%",
        }}
      >
        Live
      </span>
    </span>
  )
}
