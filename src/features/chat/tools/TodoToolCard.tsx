import { useRef } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { ListTodo, CheckSquare, Square, CircleDot } from "lucide-react"
import type { TodoToolDetail, ToolCall } from "@/lib/types"
import { ToolCardShell } from "./ToolCardShell"
import { prefersReducedMotion } from "@/lib/motion"

const STATUS_ICON: Record<string, typeof CheckSquare> = {
  completed: CheckSquare,
  in_progress: CircleDot,
}

export function TodoToolCard({ tool }: { tool: ToolCall }) {
  const detail = tool.detail as TodoToolDetail | null
  const todos = detail?.todos ?? []
  const listRef = useRef<HTMLUListElement>(null)
  const done = todos.filter((t) => t.status === "completed").length

  useGSAP(() => {
    if (!listRef.current || prefersReducedMotion()) return
    gsap.from(listRef.current.children, { opacity: 0, x: -6, duration: 0.25, stagger: 0.04, ease: "power2.out" })
  }, [])

  return (
    <ToolCardShell
      icon={<ListTodo className="size-3 shrink-0" />}
      title={tool.name}
      summary={
        todos.length > 0 ? (
          <span className="text-muted-foreground">
            {done}/{todos.length} done
          </span>
        ) : undefined
      }
      status={tool.status}
      defaultOpen
    >
      {todos.length === 0 ? (
        <p className="text-xs text-muted-foreground">No todos.</p>
      ) : (
        <ul ref={listRef} className="flex flex-col gap-1.5">
          {todos.map((t) => {
            const Icon = STATUS_ICON[t.status] ?? Square
            return (
              <li key={t.id} className="flex items-center gap-2 text-xs">
                <Icon
                  className={
                    "size-3.5 shrink-0 " +
                    (t.status === "completed" ? "text-mint" : t.status === "in_progress" ? "text-amber" : "text-muted-foreground")
                  }
                />
                <span className={t.status === "completed" ? "text-muted-foreground line-through" : ""}>{t.content}</span>
              </li>
            )
          })}
        </ul>
      )}
    </ToolCardShell>
  )
}
