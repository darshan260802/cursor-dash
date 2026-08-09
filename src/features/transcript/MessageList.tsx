import { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { Message } from "@/lib/types"
import { MessageBubble } from "./MessageBubble"
import { EmptyState } from "@/components/EmptyState"
import { MessageSquareDashed } from "lucide-react"

export function MessageList({ messages }: { messages: Message[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    overscan: 6,
  })

  if (messages.length === 0) {
    return (
      <EmptyState
        title="No messages"
        description="This session has no recorded messages yet."
        icon={<MessageSquareDashed className="size-8" />}
        className="m-6"
      />
    )
  }

  return (
    <div ref={parentRef} className="scrollbar-thin h-full overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const message = messages[row.index]
          const prev = row.index > 0 ? messages[row.index - 1] : null
          const elapsedMs =
            prev?.createdAt && message.createdAt ? new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() : null
          return (
            <div
              key={message.id}
              ref={virtualizer.measureElement}
              data-index={row.index}
              style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${row.start}px)` }}
            >
              <MessageBubble message={message} elapsedMs={elapsedMs} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
