import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ComponentProps } from "react"
import type { Message } from "@/lib/types"
import { ThinkingBlock } from "./ThinkingBlock"
import { ToolCallRow } from "./ToolCallRow"
import { CodeBlock } from "./CodeBlock"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

function formatClock(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function formatElapsed(ms: number | null) {
  if (ms == null || ms < 0) return null
  if (ms < 1000) return `+${ms}ms`
  return `+${(ms / 1000).toFixed(1)}s`
}

const markdownComponents: ComponentProps<typeof ReactMarkdown>["components"] = {
  code(props) {
    const { className, children } = props
    const match = /language-(\w+)/.exec(className || "")
    const text = String(children).replace(/\n$/, "")
    if (match) return <CodeBlock code={text} lang={match[1]} />
    return <code className="num rounded bg-muted px-1 py-0.5 text-[0.85em]">{children}</code>
  },
  a({ children, ...rest }) {
    return (
      <a {...rest} target="_blank" rel="noreferrer" className="text-amber underline underline-offset-2">
        {children}
      </a>
    )
  },
  ul({ children }) {
    return <ul className="ml-4 list-disc space-y-1">{children}</ul>
  },
  ol({ children }) {
    return <ol className="ml-4 list-decimal space-y-1">{children}</ol>
  },
}

export function MessageBubble({ message, elapsedMs }: { message: Message; elapsedMs: number | null }) {
  const isUser = message.role === "user"
  return (
    <div id={`msg-${message.id}`} className={cn("flex gap-3 px-4 py-3", isUser && "bg-muted/25")}>
      <div className="flex w-14 shrink-0 flex-col items-end gap-0.5 pt-1 text-right">
        <span className="num text-[10px] text-muted-foreground">#{message.index}</span>
        <span className="num text-[10px] text-muted-foreground">{formatClock(message.createdAt)}</span>
        {elapsedMs != null && <span className="num text-[10px] text-muted-foreground/70">{formatElapsed(elapsedMs)}</span>}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-1.5">
          <Badge variant={isUser ? "outline" : "amber"} className="text-[10px]">
            {isUser ? "you" : "assistant"}
          </Badge>
          {message.model && (
            <span className="num text-[10px] text-muted-foreground" title={message.modelSource === "inferred" ? "Inferred from session model config" : "Reported by Cursor"}>
              {message.model}
              {message.modelSource === "inferred" && "*"}
            </span>
          )}
        </div>

        {message.thinking && <ThinkingBlock text={message.thinking.text} durationMs={message.thinking.durationMs} />}

        {message.text && (
          <div className="prose-sm max-w-none text-[13.5px] leading-relaxed break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.text}
            </ReactMarkdown>
          </div>
        )}

        {message.codeBlocks
          .filter((b) => b.content)
          .map((b, i) => (
            <CodeBlock key={i} code={b.content ?? ""} lang={b.languageId} path={b.path} />
          ))}

        {message.toolCalls.map((t, i) => (
          <ToolCallRow key={t.id ?? i} tool={t} />
        ))}

        {message.error && (
          <div className="flex items-start gap-2 rounded-md border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span className="whitespace-pre-wrap">
              {typeof message.error.error === "string"
                ? message.error.error
                : (message.error.error as { detail?: string })?.detail ||
                  (message.error.error as { title?: string })?.title ||
                  JSON.stringify(message.error.error)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
