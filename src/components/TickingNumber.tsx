import { useEffect, useRef } from "react"
import gsap from "gsap"
import { prefersReducedMotion } from "@/lib/motion"

/** Tweens the displayed number toward `value` instead of snapping — the
 * live token/cost counters should visibly climb, not just jump. */
export function TickingNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const state = useRef({ n: value })
  const formatRef = useRef(format)
  formatRef.current = format

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) {
      state.current.n = value
      el.textContent = formatRef.current(value)
      return
    }
    const tween = gsap.to(state.current, {
      n: value,
      duration: 0.6,
      ease: "power2.out",
      onUpdate: () => {
        if (el) el.textContent = formatRef.current(state.current.n)
      },
    })
    return () => {
      tween.kill()
    }
    // Intentionally omits `format` — a new inline function identity each
    // render shouldn't restart the in-flight tween.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <span ref={ref}>{format(value)}</span>
}
