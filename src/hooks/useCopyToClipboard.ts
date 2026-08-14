import { useCallback, useRef, useState } from "react"

/** The established "copy" convention in this app (see CodeBlock.tsx's
 * inline version): a boolean flip back to false after 1200ms, driving a
 * Copy -> Check icon swap. Extracted here so the Share page's two copy
 * buttons (URL, access code) don't duplicate it a second and third time. */
export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 1200)
    })
  }, [])

  return { copied, copy }
}
