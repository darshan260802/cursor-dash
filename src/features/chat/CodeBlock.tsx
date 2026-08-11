import { useEffect, useState } from "react"
import { highlightCode } from "@/lib/highlighter"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { Copy, Check } from "lucide-react"

interface CodeBlockProps {
  code: string
  lang?: string | null
  path?: string | null
  className?: string
  maxHeight?: number
}

export function CodeBlock({ code, lang, path, className, maxHeight = 420 }: CodeBlockProps) {
  const { theme } = useTheme()
  const [html, setHtml] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    highlightCode(code, lang, theme).then((h) => {
      if (!cancelled) setHtml(h)
    })
    return () => {
      cancelled = true
    }
  }, [code, lang, theme])

  return (
    <div className={cn("group/code relative overflow-hidden rounded-md border border-border", className)}>
      {path && (
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
          <span className="num truncate text-[11px] text-muted-foreground">{path}</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(code).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          })
        }}
        className="absolute top-1.5 right-1.5 z-10 rounded-md border border-border bg-card/90 p-1 text-muted-foreground opacity-0 transition-opacity group-hover/code:opacity-100 hover:text-foreground"
        aria-label="Copy code"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <div
        className="num overflow-auto p-3 text-[13px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
        style={{ maxHeight }}
      >
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="whitespace-pre-wrap break-words text-muted-foreground">{code}</pre>
        )}
      </div>
    </div>
  )
}
