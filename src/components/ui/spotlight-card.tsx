// Vendored from ReactBits (SpotlightCard-TS-TW, @react-bits registry) and
// adapted to this app's design tokens — dependency-free (no motion/gsap
// needed), so it fits the "GSAP for our own animation, ReactBits where it
// doesn't require pulling in Motion too" scope for this pass.
"use client"

import { useRef, useState, type MouseEventHandler, type PropsWithChildren } from "react"
import { cn } from "@/lib/utils"

interface Position {
  x: number
  y: number
}

interface SpotlightCardProps extends PropsWithChildren {
  className?: string
  spotlightColor?: string
}

export function SpotlightCard({ children, className, spotlightColor = "color-mix(in oklab, var(--iris) 35%, transparent)" }: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
  const [opacity, setOpacity] = useState(0)

  const handleMouseMove: MouseEventHandler<HTMLDivElement> = (e) => {
    if (!divRef.current || isFocused) return
    const rect = divRef.current.getBoundingClientRect()
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onFocus={() => {
        setIsFocused(true)
        setOpacity(0.6)
      }}
      onBlur={() => {
        setIsFocused(false)
        setOpacity(0)
      }}
      onMouseEnter={() => setOpacity(0.6)}
      onMouseLeave={() => setOpacity(0)}
      className={cn("relative overflow-hidden", className)}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-in-out"
        style={{
          opacity,
          background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 70%)`,
        }}
        aria-hidden
      />
      {children}
    </div>
  )
}
