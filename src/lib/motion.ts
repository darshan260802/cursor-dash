// Shared GSAP timing so every animation in the app feels like it comes
// from the same hand. Import these instead of hardcoding durations/eases.

export const DURATION = {
  fast: 0.18,
  base: 0.32,
  slow: 0.5,
} as const

export const EASE = {
  out: "power2.out",
  inOut: "power2.inOut",
  back: "back.out(1.7)",
} as const

/** True when the user has asked the OS to minimize motion. Read once per
 * call site inside a `gsap.matchMedia()` branch — see individual
 * components for the pattern — not cached, since it can change live. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
