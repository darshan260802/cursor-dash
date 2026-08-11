import { Wrench } from "lucide-react"
import type { ToolCall } from "@/lib/types"
import { CodeBlock } from "../CodeBlock"
import { ToolCardShell } from "./ToolCardShell"

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
  if (typeof args.query === "string") return args.query
  return null
}

/** The fallback for any tool name this codebase doesn't specifically
 * recognize — raw args/result, same shape as before the chat rewrite.
 * An unfamiliar tool must never break the transcript view. */
export function GenericToolCard({ tool }: { tool: ToolCall }) {
  const argsText = stringify(tool.args)
  const resultText = stringify(tool.result)
  const truncatedArgs = argsText.length > MAX_PREVIEW_CHARS
  const truncatedResult = resultText.length > MAX_PREVIEW_CHARS

  return (
    <ToolCardShell
      icon={<Wrench className="size-3 shrink-0" />}
      title={tool.name}
      summary={summarize(tool)}
      status={tool.status}
      durationMs={tool.durationMs}
    >
      {argsText && (
        <div>
          <div className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Arguments</div>
          <CodeBlock code={truncatedArgs ? argsText.slice(0, MAX_PREVIEW_CHARS) + "\n… truncated" : argsText} lang="json" maxHeight={240} />
        </div>
      )}
      {resultText && (
        <div>
          <div className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Result</div>
          <CodeBlock
            code={truncatedResult ? resultText.slice(0, MAX_PREVIEW_CHARS) + "\n… truncated" : resultText}
            lang="json"
            maxHeight={240}
          />
        </div>
      )}
    </ToolCardShell>
  )
}
