import { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useParams } from "react-router"
import type { SessionSummary } from "@/lib/types"
import { SessionRow, SessionRowSkeleton } from "./SessionRow"
import { EmptyState } from "@/components/EmptyState"
import { Inbox } from "lucide-react"

const ROW_HEIGHT = 74

export function SessionList({ items, isLoading, total }: { items: SessionSummary[]; isLoading: boolean; total: number }) {
  const { id: activeId } = useParams()
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  if (isLoading && items.length === 0) {
    return (
      <div>
        {Array.from({ length: 8 }).map((_, i) => (
          <SessionRowSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No sessions match"
        description="Try widening your filters, or clear them to see everything."
        icon={<Inbox className="size-8" />}
        className="m-4 border-none"
      />
    )
  }

  return (
    <div ref={parentRef} className="scrollbar-thin h-full overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const session = items[row.index]
          return (
            <div key={session.id} style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${row.start}px)` }}>
              <SessionRow session={session} active={session.id === activeId} />
            </div>
          )
        })}
      </div>
      <div className="px-3 py-2 text-center text-[11px] text-muted-foreground">
        {items.length} of {total} session{total === 1 ? "" : "s"}
      </div>
    </div>
  )
}
