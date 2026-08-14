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

/** In `--share` mode, a 401 means the gate no longer recognizes us — the
 * session cookie expired, or the server was restarted with a fresh code.
 * The only fix is re-entering the code, and the server already serves that
 * page on a plain navigation, so the honest move is to go there rather
 * than let every query on screen render as a broken error or spin
 * forever. Never happens in the default (non-share) setup. */
function handleUnauthorized(): never {
  window.location.reload()
  // The reload is async; throwing keeps this call (and anything awaiting
  // it) from resolving with no data in the meantime.
  throw new Error("access_required")
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (res.status === 401) handleUnauthorized()
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message || body?.error || `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (res.status === 401) handleUnauthorized()
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

interface ChangesResponse {
  version: number
  scopes: string[]
  changedSessionIds: string[]
}

// Maps a server-reported change scope to the query keys it can affect.
// Keeping this list (rather than a blanket invalidateQueries() on every
// tick, which is what an earlier version of this hook did) is what makes
// live updates cheap on the session-detail and analytics pages — a change
// to one session no longer refetches every other page's queries too.
const SCOPE_QUERY_KEYS: Record<string, string[][]> = {
  sessions: [["sessions"], ["overview"], ["timeline"], ["models"], ["tools"], ["context-pressure"], ["meta"]],
  live: [["live"]],
  workspaces: [["workspaces"]],
  codeTracking: [["code-tracking"]],
}

/** Long-polls the server's change feed (`GET /api/changes?since=`) and
 * invalidates exactly the query keys a reported change can affect —
 * replacing what used to be a Server-Sent Events stream. SSE doesn't
 * survive `--share`'s tunnel: Cloudflare's Quick Tunnels buffer
 * SSE-over-GET until the connection closes, which makes push updates
 * arrive only once the stream itself ends — so a plain long-poll is used
 * everywhere, not just when sharing, rather than maintaining two
 * transports. Latency is the same as SSE on localhost (the request
 * resolves the instant the server has something to report), and every
 * intermediary that buffers streaming responses works fine with it.
 * Reconnects with backoff on a network error; a share session that's
 * expired or been revoked (401) sends the browser to the access-code page
 * instead of retrying forever. */
export function useLiveUpdates() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<LiveConnectionStatus>("connecting")
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const queryClientRef = useRef(queryClient)
  queryClientRef.current = queryClient

  useEffect(() => {
    let stopped = false
    let controller: AbortController | null = null

    function invalidate(scopes: string[], changedSessionIds: string[]) {
      if (scopes.includes("all")) {
        // The server's honest fallback for a client that fell too far
        // behind (e.g. a long-backgrounded tab) to reconstruct exactly
        // what changed — same blanket behavior the old SSE handler always
        // used, just no longer the common case.
        queryClientRef.current.invalidateQueries()
        return
      }
      const invalidated = new Set<string>()
      for (const scope of scopes) {
        for (const key of SCOPE_QUERY_KEYS[scope] ?? []) {
          const cacheKey = JSON.stringify(key)
          if (invalidated.has(cacheKey)) continue
          invalidated.add(cacheKey)
          queryClientRef.current.invalidateQueries({ queryKey: key })
        }
      }
      for (const id of changedSessionIds) {
        queryClientRef.current.invalidateQueries({ queryKey: ["session", id] })
        queryClientRef.current.invalidateQueries({ queryKey: ["session-messages", id] })
      }
    }

    async function loop() {
      let since = 0
      let attempt = 0
      let first = true

      while (!stopped) {
        controller = new AbortController()
        try {
          const res = await fetch(`/api/changes?since=${since}`, { signal: controller.signal })
          if (stopped) return
          if (res.status === 401) {
            window.location.reload()
            return
          }
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)

          const data = (await res.json()) as ChangesResponse
          attempt = 0
          setStatus("connected")

          if (data.version > since) {
            since = data.version
            // Skip invalidating on the very first response: it always
            // reports "everything since 0", but the page just loaded with
            // fresh data — there's nothing stale to refetch yet.
            if (!first && data.scopes.length > 0) {
              setLastEventAt(Date.now())
              invalidate(data.scopes, data.changedSessionIds)
            }
          }
          first = false
        } catch (err) {
          if (stopped || (err instanceof DOMException && err.name === "AbortError")) return
          setStatus("reconnecting")
          const delay = Math.min(1000 * 2 ** attempt, 15_000)
          attempt += 1
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    loop()
    return () => {
      stopped = true
      controller?.abort()
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
