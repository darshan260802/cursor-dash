import { AlertTriangle } from "lucide-react"
import type { MessageError } from "@/lib/types"

export function ErrorBlock({ error }: { error: MessageError }) {
  const detail =
    typeof error.error === "string"
      ? error.error
      : (error.error as { detail?: string })?.detail || (error.error as { title?: string })?.title || JSON.stringify(error.error)

  return (
    <div className="flex items-start gap-2 rounded-md border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span className="whitespace-pre-wrap">{detail}</span>
    </div>
  )
}
