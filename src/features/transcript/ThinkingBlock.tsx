import { useState } from "react"
import { BrainCircuit, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export function ThinkingBlock({ text, durationMs }: { text: string; durationMs: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-md border border-iris/25 bg-iris/5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-iris hover:bg-iris/10"
      >
        <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
        <BrainCircuit className="size-3 shrink-0" />
        <span>Thinking</span>
        <span className="num ml-auto shrink-0 text-muted-foreground">{(durationMs / 1000).toFixed(durationMs < 1000 ? 3 : 1)}s</span>
      </button>
      {open && <p className="border-t border-iris/20 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{text}</p>}
    </div>
  )
}
