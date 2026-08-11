import { ListTodo, CheckSquare, Square, CircleDot } from "lucide-react"
import type { TodoToolDetail, ToolCall } from "@/lib/types"
import { ToolCardShell } from "./ToolCardShell"

const STATUS_ICON: Record<string, typeof CheckSquare> = {
  completed: CheckSquare,
  in_progress: CircleDot,
}

/** No entrance animation here: this card lives inside a virtualized list
 * and remounts every time it scrolls in and out of view, so a
 * mount-triggered stagger would replay constantly while scrolling
 * instead of playing once. */
export function TodoToolCard({ tool }: { tool: ToolCall }) {
  const detail = tool.detail as TodoToolDetail | null
  const todos = detail?.todos ?? []
  const done = todos.filter((t) => t.status === "completed").length

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
        <ul className="flex flex-col gap-1.5">
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
