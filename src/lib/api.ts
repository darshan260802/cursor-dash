import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import type {
  AiTracking,
  ContextPressureEntry,
  FileChange,
  LiveState,
  Meta,
  ModelBreakdownEntry,
  Overview,
  Paginated,
  Pricing,
  SessionDetail,
  SessionQuery,
  Message,
  TimelineBucket,
  ToolBreakdownEntry,
  WorkspaceActivity,
} from "./types"

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message || body?.error || `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.text()
}

function qs(params: Record<string, unknown> = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ""
}

export type LiveConnectionStatus = "connecting" | "connected" | "reconnecting"

/** Subscribe to the server's change stream and invalidate all queries on
 * every event — the whole dataset is small enough that a blanket
 * invalidation is simpler and cheap enough vs. tracking fine-grained scope.
 * Reconnects with backoff on drop (dev-server restarts, sleep/wake, a
 * proxy killing an idle connection) and reports honest connection status
 * rather than silently going quiet. */
export function useLiveUpdates() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<LiveConnectionStatus>("connecting")
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const queryClientRef = useRef(queryClient)
  queryClientRef.current = queryClient

  useEffect(() => {
    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0
    let stopped = false

    function connect() {
      source = new EventSource("/api/events")
      source.addEventListener("open", () => {
        attempt = 0
        setStatus("connected")
      })
      source.addEventListener("change", () => {
        setLastEventAt(Date.now())
        queryClientRef.current.invalidateQueries()
      })
      source.onerror = () => {
        source?.close()
        if (stopped) return
        setStatus("reconnecting")
        const delay = Math.min(1000 * 2 ** attempt, 15_000)
        attempt += 1
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      stopped = true
      source?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [])

  return { status, lastEventAt }
}

/** Manual "refresh now" — forces the server to re-snapshot and re-read
 * everything rather than trusting mtime fingerprints, then invalidates
 * every query so the UI reflects it immediately. */
export function useRefreshAll() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => fetchJson<Meta>("/api/refresh", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

type QOpts<T> = Omit<UseQueryOptions<T>, "queryKey" | "queryFn">

export function useMeta(opts?: QOpts<Meta>) {
  return useQuery({ queryKey: ["meta"], queryFn: () => fetchJson<Meta>("/api/meta"), ...opts })
}

export function useOverview(opts?: QOpts<Overview>) {
  return useQuery({ queryKey: ["overview"], queryFn: () => fetchJson<Overview>("/api/overview"), ...opts })
}

/** The actively-generating session, if any — polls faster while something
 * is running so the /live page and badges feel responsive, and backs off
 * once it's idle. */
export function useLiveState() {
  return useQuery({
    queryKey: ["live"],
    queryFn: () => fetchJson<LiveState>("/api/live"),
    refetchInterval: (query) => (query.state.data?.isGenerating ? 1500 : 8000),
  })
}

// The list endpoint returns the same fully-enriched shape as a single
// session (cache.js keeps one in-memory list, not a stripped-down index),
// so callers get tokens/cost/toolNames/etc. without a second request.
export function useSessions(query: SessionQuery, opts?: QOpts<Paginated<SessionDetail>>) {
  return useQuery({
    queryKey: ["sessions", query],
    queryFn: () => fetchJson<Paginated<SessionDetail>>(`/api/sessions${qs(query as Record<string, unknown>)}`),
    placeholderData: (prev) => prev,
    ...opts,
  })
}

export function useSession(id: string | undefined, opts?: QOpts<SessionDetail>) {
  return useQuery({
    queryKey: ["session", id],
    queryFn: () => fetchJson<SessionDetail>(`/api/sessions/${id}`),
    enabled: !!id,
    ...opts,
  })
}

export function useSessionMessages(id: string | undefined, opts?: QOpts<Paginated<Message>>) {
  return useQuery({
    queryKey: ["session-messages", id],
    // High enough that no real session gets truncated (matches the export
    // endpoint's own limit) — see server/filters.js's paginate() maxLimit.
    queryFn: () => fetchJson<Paginated<Message>>(`/api/sessions/${id}/messages${qs({ limit: 100_000 })}`),
    enabled: !!id,
    ...opts,
  })
}

export function useTranscriptOutcome(id: string | undefined) {
  return useQuery({
    queryKey: ["transcript-outcome", id],
    queryFn: () => fetchJson<{ status: string | null; error: string | null }>(`/api/sessions/${id}/transcript-outcome`),
    enabled: !!id,
  })
}

export function useSessionFiles(id: string | undefined) {
  return useQuery({
    queryKey: ["session-files", id],
    queryFn: () => fetchJson<FileChange[]>(`/api/sessions/${id}/files`),
    enabled: !!id,
  })
}

/** Lazily fetches one content-addressed blob (a full file body) for a
 * session — used by "view full file" in the diff viewer. `key` is a
 * `composer.content.<sha256>` or `ofsContent:…` id; pass undefined until
 * the user actually asks to see it, since these can run to megabytes. */
export function useSessionContent(id: string | undefined, key: string | null | undefined) {
  return useQuery({
    queryKey: ["session-content", id, key],
    queryFn: () => fetchText(`/api/sessions/${id}/content${qs({ key })}`),
    enabled: !!id && !!key,
    staleTime: Infinity, // content at a fixed id never changes
  })
}

export function useTimeline(unit: "day" | "week" = "day") {
  return useQuery({
    queryKey: ["timeline", unit],
    queryFn: () => fetchJson<TimelineBucket[]>(`/api/analytics/timeline${qs({ unit })}`),
  })
}

export function useModelBreakdown() {
  return useQuery({ queryKey: ["models"], queryFn: () => fetchJson<ModelBreakdownEntry[]>("/api/analytics/models") })
}

export function useToolBreakdown() {
  return useQuery({ queryKey: ["tools"], queryFn: () => fetchJson<ToolBreakdownEntry[]>("/api/analytics/tools") })
}

export function useContextPressure() {
  return useQuery({
    queryKey: ["context-pressure"],
    queryFn: () => fetchJson<ContextPressureEntry[]>("/api/analytics/context"),
  })
}

export function useWorkspaces() {
  return useQuery({ queryKey: ["workspaces"], queryFn: () => fetchJson<WorkspaceActivity[]>("/api/workspaces") })
}

export function useAiTracking() {
  return useQuery({ queryKey: ["code-tracking"], queryFn: () => fetchJson<AiTracking>("/api/code-tracking") })
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: ["search", q],
    queryFn: () => fetchJson<{ id: string; title: string; updatedAt: number }[]>(`/api/search${qs({ q })}`),
    enabled: q.length > 1,
  })
}

export function usePricing() {
  return useQuery({ queryKey: ["pricing"], queryFn: () => fetchJson<Pricing>("/api/pricing") })
}

export function useSetPricing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (models: Record<string, { input: number | null; output: number | null }>) =>
      fetchJson<Pricing>("/api/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ models }),
      }),
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

export function useCloudSync() {
  return useMutation({
    mutationFn: () => fetchJson<{ ok: boolean; reason?: string; data?: unknown }>("/api/cloud/sync", { method: "POST" }),
  })
}

interface PricingRefreshResult {
  ok: boolean
  updatedCount?: number
  fetchedAt?: number
  sourceUrl?: string
  reason?: string
  message?: string
}

/** Fetches and parses cursor.com's published model-pricing docs page and
 * merges the rates into the pricing table (manual edits are preserved). */
export function useRefreshPricingFromDocs() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => fetchJson<PricingRefreshResult>("/api/pricing/refresh", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

export function sessionExportUrl(id: string, format: "json" | "md") {
  return `/api/sessions/${id}/export${qs({ format })}`
}
