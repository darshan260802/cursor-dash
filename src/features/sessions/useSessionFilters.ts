import { useMemo } from "react"
import { useSearchParams } from "react-router"
import type { SessionQuery } from "@/lib/types"

const BOOL_KEYS = ["hasErrors", "hasToolCalls", "includeArchived", "includeSubagent", "includeDraft"] as const
const STRING_KEYS = ["q", "workspace", "model", "mode", "status", "tool", "fileExtension", "sort", "order"] as const
const NUM_KEYS = ["from", "to", "minTokens", "maxTokens", "minLines", "maxLines"] as const

/** Session filters, kept in the URL so a filtered view is shareable/bookmarkable. */
export function useSessionFilters() {
  const [params, setParams] = useSearchParams()

  const query = useMemo<SessionQuery>(() => {
    const q: SessionQuery = {}
    for (const key of STRING_KEYS) {
      const v = params.get(key)
      if (v) (q as Record<string, unknown>)[key] = v
    }
    for (const key of NUM_KEYS) {
      const v = params.get(key)
      if (v) (q as Record<string, unknown>)[key] = Number(v)
    }
    for (const key of BOOL_KEYS) {
      if (params.get(key) === "1") (q as Record<string, unknown>)[key] = true
    }
    return q
  }, [params])

  function setFilter(key: string, value: string | number | boolean | null | undefined) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === null || value === undefined || value === "" || value === false) {
          next.delete(key)
        } else {
          next.set(key, value === true ? "1" : String(value))
        }
        return next
      },
      { replace: true }
    )
  }

  function clearAll() {
    setParams(new URLSearchParams(), { replace: true })
  }

  const activeCount = Array.from(params.keys()).filter((k) => k !== "sort" && k !== "order").length

  return { query, setFilter, clearAll, activeCount }
}
