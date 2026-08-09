import { useState } from "react"
import { ChevronRight, CheckCircle2, XCircle, CircleDashed, Wrench } from "lucide-react"
import type { ToolCall } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CodeBlock } from "./CodeBlock"

const MAX_PREVIEW_CHARS = 20_000

function stringify(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function summarize(tool: ToolCall): string | null {
  const args = tool.args as Record<string, unknown> | null
  if (!args || typeof args !== "object") return null
  if (typeof args.command === "string") return args.command
  if (typeof args.targetFile === "string") return args.targetFile
  if (typeof args.globPattern === "string") return `${args.targetDirectory ?? ""} ${args.globPattern}`.trim()
  if (typeof args.query === "string") return args.query
  return null
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="size-3.5 text-mint" />,
  error: <XCircle className="size-3.5 text-coral" />,
}

export function ToolCallRow({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false)
  const summary = summarize(tool)
  const argsText = stringify(tool.args)
  const resultText = stringify(tool.result)
  const truncatedArgs = argsText.length > MAX_PREVIEW_CHARS
  const truncatedResult = resultText.length > MAX_PREVIEW_CHARS

  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted/60"
      >
        <ChevronRight className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <Wrench className="size-3 shrink-0 text-iris" />
        <span className="num shrink-0 font-medium">{tool.name}</span>
        {summary && <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary}</span>}
        <span className="shrink-0">{STATUS_ICON[tool.status] ?? <CircleDashed className="size-3.5 text-muted-foreground" />}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-border p-2">
          {argsText && (
            <div>
              <div className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Arguments</div>
              <CodeBlock code={truncatedArgs ? argsText.slice(0, MAX_PREVIEW_CHARS) + "\n… truncated" : argsText} lang="json" maxHeight={240} />
            </div>
          )}
          {resultText && (
            <div>
              <div className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Result</div>
              <CodeBlock code={truncatedResult ? resultText.slice(0, MAX_PREVIEW_CHARS) + "\n… truncated" : resultText} lang="json" maxHeight={240} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
