import { Search, X, SlidersHorizontal } from "lucide-react"
import { useSessionFilters } from "./useSessionFilters"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const SORT_OPTIONS = [
  { value: "recency", label: "Recent activity" },
  { value: "createdAt", label: "Created" },
  { value: "tokens", label: "Tokens" },
  { value: "cost", label: "Cost" },
  { value: "messages", label: "Messages" },
  { value: "lines", label: "Lines changed" },
  { value: "duration", label: "Duration" },
]

export function SessionFilters({ toolOptions, modelOptions }: { toolOptions: string[]; modelOptions: string[] }) {
  const { query, setFilter, clearAll, activeCount } = useSessionFilters()

  return (
    <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query.q ?? ""}
            onChange={(e) => setFilter("q", e.target.value)}
            placeholder="Search sessions..."
            className="h-8 w-full rounded-2xl border border-transparent bg-input/50 pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </div>
        <Select value={query.sort ?? "recency"} onValueChange={(v) => setFilter("sort", v)}>
          <SelectTrigger size="sm" className="w-40 shrink-0">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={query.mode ?? "any"} onValueChange={(v) => setFilter("mode", v === "any" ? null : v)}>
          <SelectTrigger size="sm" className="h-7 text-xs">
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any mode</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="chat">Chat</SelectItem>
          </SelectContent>
        </Select>

        {modelOptions.length > 0 && (
          <Select value={query.model ?? "any"} onValueChange={(v) => setFilter("model", v === "any" ? null : v)}>
            <SelectTrigger size="sm" className="h-7 text-xs">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any model</SelectItem>
              {modelOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {toolOptions.length > 0 && (
          <Select value={query.tool ?? "any"} onValueChange={(v) => setFilter("tool", v === "any" ? null : v)}>
            <SelectTrigger size="sm" className="h-7 text-xs">
              <SelectValue placeholder="Tool used" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any tool</SelectItem>
              {toolOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <FilterToggle label="Errors" checked={!!query.hasErrors} onChange={(v) => setFilter("hasErrors", v)} />
        <FilterToggle label="Tool calls" checked={!!query.hasToolCalls} onChange={(v) => setFilter("hasToolCalls", v)} />
        <FilterToggle label="Archived" checked={!!query.includeArchived} onChange={(v) => setFilter("includeArchived", v)} />
        <FilterToggle label="Drafts" checked={!!query.includeDraft} onChange={(v) => setFilter("includeDraft", v)} />

        {activeCount > 0 && (
          <Button variant="ghost" size="xs" onClick={clearAll} className="ml-auto text-muted-foreground">
            <X className="size-3" /> Clear
            <Badge variant="outline" className="ml-1">
              {activeCount}
            </Badge>
          </Button>
        )}
        {activeCount === 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <SlidersHorizontal className="size-3" /> No filters
          </span>
        )}
      </div>
    </div>
  )
}

function FilterToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground has-data-[state=checked]:border-amber/40 has-data-[state=checked]:bg-amber/10 has-data-[state=checked]:text-amber">
      <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
      {label}
    </label>
  )
}
