import { TerminalSquare } from "lucide-react"
import type { TerminalToolDetail, ToolCall } from "@/lib/types"
import { ToolCardShell } from "./ToolCardShell"

const MAX_OUTPUT_CHARS = 20_000

export function TerminalToolCard({ tool }: { tool: ToolCall }) {
  const detail = tool.detail as TerminalToolDetail | null
  const output = detail?.output ?? ""
  const truncated = output.length > MAX_OUTPUT_CHARS

  return (
    <ToolCardShell
      icon={<TerminalSquare className="size-3 shrink-0" />}
      title={tool.name}
      summary={<span className="num truncate">{detail?.command}</span>}
      status={tool.status}
      durationMs={tool.durationMs}
    >
      {detail?.command && (
        <pre className="num overflow-x-auto rounded-md bg-foreground/5 p-2 text-[12px] whitespace-pre-wrap text-foreground">
          <span className="text-mint">$</span> {detail.command}
        </pre>
      )}
      {output ? (
        <pre className="num max-h-72 overflow-auto rounded-md border border-border bg-muted/30 p-2 text-[12px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {truncated ? output.slice(0, MAX_OUTPUT_CHARS) + "\n… truncated" : output}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">No output.</p>
      )}
      {detail?.rejected && <p className="text-xs text-coral">Rejected — this command was not run.</p>}
    </ToolCardShell>
  )
}
