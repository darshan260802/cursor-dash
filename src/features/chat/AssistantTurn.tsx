import { Sparkles } from "lucide-react"
import type { Message } from "@/lib/types"
import { ThinkingBlock } from "./blocks/ThinkingBlock"
import { TextBlock } from "./blocks/TextBlock"
import { ErrorBlock } from "./blocks/ErrorBlock"
import { CodeBlock } from "./CodeBlock"
import { ToolCard } from "./tools/ToolCard"

/** One assistant message. Named for the conceptual turn it represents (a
 * single response in the exchange), not a wrapper around several
 * messages — see features/chat/timeline.ts for why grouping happens at
 * the row level instead. */
export function AssistantTurn({ message, showHeader }: { message: Message; showHeader: boolean }) {
  return (
    <div className="flex gap-2.5 px-4 py-1.5">
      <div className="flex w-6 shrink-0 justify-center pt-0.5">
        {showHeader && (
          <span className="flex size-6 items-center justify-center rounded-full bg-amber/15 text-amber">
            <Sparkles className="size-3.5" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {showHeader && message.model && (
          <span
            className="num text-[10px] text-muted-foreground"
            title={message.modelSource === "inferred" ? "Inferred from session model config" : "Reported by Cursor"}
          >
            {message.model}
            {message.modelSource === "inferred" && "*"}
          </span>
        )}
        {message.blocks.length === 0 && !message.text ? (
          <p className="text-xs text-muted-foreground italic">(empty message)</p>
        ) : (
          message.blocks.map((block, i) => {
            if (block.kind === "thinking") return <ThinkingBlock key={i} text={block.text} durationMs={block.durationMs} />
            if (block.kind === "text") return <TextBlock key={i} text={block.text} />
            if (block.kind === "code") return block.content ? <CodeBlock key={i} code={block.content} lang={block.languageId} path={block.path} /> : null
            if (block.kind === "tool") return <ToolCard key={i} tool={block.tool} sessionId={message.sessionId} />
            if (block.kind === "error") return <ErrorBlock key={i} error={block.error} />
            return null
          })
        )}
      </div>
    </div>
  )
}
