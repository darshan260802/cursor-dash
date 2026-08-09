import { useState } from "react"
import { Search, X, SlidersHorizontal, CalendarDays } from "lucide-react"
import { useSessionFilters } from "./useSessionFilters"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { dateInputToMs, toDateInputValue } from "@/lib/format"
import { cn } from "@/lib/utils"

const SORT_OPTIONS = [
  { value: "recency", label: "Recent activity" },
  { value: "createdAt", label: "Created" },
  { value: "tokens", label: "Tokens" },
  { value: "cost", label: "Cost" },
  { value: "messages", label: "Messages" },
  { value: "lines", label: "Lines changed" },
  { value: "duration", label: "Duration" },
]

const MODE_OPTIONS = [
  { value: "any", label: "Any mode" },
  { value: "agent", label: "Agent" },
  { value: "chat", label: "Chat" },
]

const DATE_PRESETS = [
  { label: "Today", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "All time", days: null },
]

export function SessionFilters({ toolOptions, modelOptions }: { toolOptions: string[]; modelOptions: string[] }) {
  const { query, setFilter, setFilters, clearAll, activeCount } = useSessionFilters()
  const [activePreset, setActivePreset] = useState<number | null | undefined>(undefined)

  const modelItems = [{ value: "any", label: "Any model" }, ...modelOptions.map((m) => ({ value: m, label: m }))]
  const toolItems = [{ value: "any", label: "Any tool" }, ...toolOptions.map((t) => ({ value: t, label: t }))]

  function applyDatePreset(days: number | null) {
    setActivePreset(days)
    if (days === null) {
      setFilters({ from: null, to: null })
      return
    }
    const now = new Date()
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1), 0, 0, 0, 0).getTime()
    setFilters({ from, to })
  }

  function setCustomDate(bound: "from" | "to", value: string) {
    setActivePreset(undefined) // a manual edit no longer matches any preset
    setFilter(bound, dateInputToMs(value, bound === "from" ? "start" : "end"))
  }

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
        <Select value={query.sort ?? "recency"} onValueChange={(v) => setFilter("sort", v)} items={SORT_OPTIONS}>
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
        <CalendarDays className="size-3.5 text-muted-foreground" />
        {DATE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyDatePreset(p.days)}
            className={cn(
              "rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
              activePreset === p.days && "border-amber/40 bg-amber/10 text-amber"
            )}
          >
            {p.label}
          </button>
        ))}
        <input
          type="date"
          value={toDateInputValue(query.from ?? null)}
          onChange={(e) => setCustomDate("from", e.target.value)}
          className="h-7 rounded-md border border-transparent bg-input/50 px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={toDateInputValue(query.to ?? null)}
          onChange={(e) => setCustomDate("to", e.target.value)}
          className="h-7 rounded-md border border-transparent bg-input/50 px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={query.mode ?? "any"} onValueChange={(v) => setFilter("mode", v === "any" ? null : v)} items={MODE_OPTIONS}>
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
          <Select
            value={query.model ?? "any"}
            onValueChange={(v) => setFilter("model", v === "any" ? null : v)}
            items={modelItems}
          >
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
          <Select
            value={query.tool ?? "any"}
            onValueChange={(v) => setFilter("tool", v === "any" ? null : v)}
            items={toolItems}
          >
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
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              clearAll()
              setActivePreset(undefined)
            }}
            className="ml-auto text-muted-foreground"
          >
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
