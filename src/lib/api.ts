import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query"
import { useEffect } from "react"
import type {
  AiTracking,
  ContextPressureEntry,
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

function qs(params: Record<string, unknown> = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ""
}

/** Subscribe to the server's change stream and invalidate all queries on
 * every event — the whole dataset is small enough that a blanket
 * invalidation is simpler and cheap enough vs. tracking fine-grained scope. */
export function useLiveUpdates() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const source = new EventSource("/api/events")
    source.addEventListener("change", () => {
      queryClient.invalidateQueries()
    })
    return () => source.close()
  }, [queryClient])
}

type QOpts<T> = Omit<UseQueryOptions<T>, "queryKey" | "queryFn">

export function useMeta(opts?: QOpts<Meta>) {
  return useQuery({ queryKey: ["meta"], queryFn: () => fetchJson<Meta>("/api/meta"), ...opts })
}

export function useOverview(opts?: QOpts<Overview>) {
  return useQuery({ queryKey: ["overview"], queryFn: () => fetchJson<Overview>("/api/overview"), ...opts })
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
    queryFn: () => fetchJson<Paginated<Message>>(`/api/sessions/${id}/messages${qs({ limit: 5000 })}`),
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
