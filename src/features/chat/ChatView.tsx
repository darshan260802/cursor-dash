import { useEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import gsap from "gsap"
import { ArrowDown, MessageSquareDashed } from "lucide-react"
import type { Message } from "@/lib/types"
import { buildTimeline } from "./timeline"
import { TurnHeader } from "./TurnHeader"
import { UserMessage } from "./UserMessage"
import { AssistantTurn } from "./AssistantTurn"
import { EmptyState } from "@/components/EmptyState"
import { prefersReducedMotion } from "@/lib/motion"

/** The single chat renderer for both a finished session (SessionDetailPane)
 * and a running one (the /live page) — pass `live` to turn on auto-follow
 * scrolling and the new-message entrance animation. A regular session view
 * opens scrolled to the top (read it from the start); a live one opens
 * pinned to the bottom (watch it as it happens). */
export function ChatView({ messages, live = false }: { messages: Message[]; live?: boolean }) {
  const timeline = useMemo(() => buildTimeline(messages), [messages])
  const parentRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const seenIds = useRef<Set<string>>(new Set())
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const seededRef = useRef(false)

  const virtualizer = useVirtualizer({
    count: timeline.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (timeline[i]?.type === "turn" ? 36 : 140),
    overscan: 8,
  })

  // A fresh inline ref callback on every render makes React detach/reattach
  // it each time (old ref called with null, new ref called with the node) —
  // which also tears down and rebuilds `measureElement`'s ResizeObserver on
  // every render. That starves it of the resize events an expanding tool
  // card fires, so later rows never reflow. Memoizing one stable callback
  // per row index keeps the observer attached across renders.
  const rowRefCallbacks = useRef(new Map<number, (el: HTMLDivElement | null) => void>())
  function rowRef(index: number) {
    let cb = rowRefCallbacks.current.get(index)
    if (!cb) {
      cb = (el) => {
        virtualizer.measureElement(el)
        if (el) rowRefs.current.set(index, el)
        else rowRefs.current.delete(index)
      }
      rowRefCallbacks.current.set(index, cb)
    }
    return cb
  }

  useEffect(() => {
    if (!seededRef.current) {
      seededRef.current = true
      for (const m of messages) seenIds.current.add(m.id)
      if (live && timeline.length > 0) {
        requestAnimationFrame(() => virtualizer.scrollToIndex(timeline.length - 1, { align: "end" }))
      }
      return
    }
    if (!live) return

    const newOnes = messages.filter((m) => !seenIds.current.has(m.id))
    if (newOnes.length === 0) return
    for (const m of newOnes) seenIds.current.add(m.id)

    if (atBottom) {
      requestAnimationFrame(() => virtualizer.scrollToIndex(timeline.length - 1, { align: "end" }))
    }

    if (!prefersReducedMotion()) {
      requestAnimationFrame(() => {
        const newIds = new Set(newOnes.map((m) => m.id))
        timeline.forEach((item, i) => {
          if (item.type !== "message" || !newIds.has(item.message.id)) return
          const el = rowRefs.current.get(i)
          if (el) gsap.from(el, { y: 12, opacity: 0, duration: 0.4, ease: "power2.out" })
        })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, live])

  function handleScroll() {
    const el = parentRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 96)
  }

  function jumpToLatest() {
    virtualizer.scrollToIndex(timeline.length - 1, { align: "end" })
    setAtBottom(true)
  }

  if (messages.length === 0) {
    return (
      <EmptyState
        title={live ? "No messages yet" : "No messages"}
        description={live ? "Waiting for the first message…" : "This session has no recorded messages yet."}
        icon={<MessageSquareDashed className="size-8" />}
        className="m-6"
      />
    )
  }

  return (
    <div className="relative h-full min-h-0">
      <div ref={parentRef} onScroll={handleScroll} className="scrollbar-thin h-full overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((row) => {
            const item = timeline[row.index]
            return (
              <div
                key={item.type === "turn" ? `turn-${item.turnIndex}` : item.message.id}
                ref={rowRef(row.index)}
                data-index={row.index}
                style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${row.start}px)` }}
              >
                {item.type === "turn" ? (
                  <TurnHeader turn={item} />
                ) : item.message.role === "user" ? (
                  <UserMessage message={item.message} />
                ) : (
                  <AssistantTurn message={item.message} showHeader={item.isFirstInRun} />
                )}
              </div>
            )
          })}
        </div>
      </div>
      {live && !atBottom && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-popover px-3 py-1.5 text-xs font-medium shadow-lg transition-colors hover:bg-accent"
        >
          <ArrowDown className="size-3.5" /> Jump to latest
        </button>
      )}
    </div>
  )
}
