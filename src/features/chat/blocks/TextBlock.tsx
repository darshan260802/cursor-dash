import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ComponentProps } from "react"
import { CodeBlock } from "../CodeBlock"

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

export function TextBlock({ text }: { text: string }) {
  return (
    <div className="prose-sm max-w-none text-[13.5px] leading-relaxed break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
