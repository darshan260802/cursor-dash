import { useMemo } from "react"
import { useParams } from "react-router"
import { useSessions } from "@/lib/api"
import { useSessionFilters } from "@/features/sessions/useSessionFilters"
import { SessionFilters } from "@/features/sessions/SessionFilters"
import { SessionList } from "@/features/sessions/SessionList"
import { SessionDetailPane } from "@/features/transcript/SessionDetailPane"
import { EmptyState } from "@/components/EmptyState"
import { MousePointerClick } from "lucide-react"

export default function Sessions() {
  const { id } = useParams()
  const { query } = useSessionFilters()
  const { data, isLoading } = useSessions(query)

  // Populate the tool/model filter dropdowns from what's actually present
  // in the (unfiltered-by-those-fields) result set, so options never go stale.
  const toolOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of data?.items ?? []) for (const t of s.toolNames ?? []) set.add(t)
    return [...set].sort()
  }, [data])

  const modelOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of data?.items ?? []) if (s.model) set.add(s.model)
    return [...set].sort()
  }, [data])

  return (
    <div className="flex h-full min-h-0">
      <div className="flex h-full w-80 shrink-0 flex-col border-r border-border xl:w-96">
        <SessionFilters toolOptions={toolOptions} modelOptions={modelOptions} />
        <div className="min-h-0 flex-1">
          <SessionList items={data?.items ?? []} isLoading={isLoading} total={data?.total ?? 0} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        {id ? (
          <SessionDetailPane id={id} />
        ) : (
          <EmptyState
            title="Select a session"
            description="Pick a session from the list to see its full transcript, token breakdown, and tool calls."
            icon={<MousePointerClick className="size-8" />}
            className="m-6 h-[calc(100%-3rem)] justify-center border-none"
          />
        )}
      </div>
    </div>
  )
}
