// The in-memory index: discovers every Cursor data source, hydrates and
// normalizes it, and keeps it fresh. Everything is local and modest in
// size (a single user's Cursor history), so the whole index — sessions,
// their messages, and the cross-session rollups — is built eagerly and
// kept in memory, with per-session reuse across refreshes keyed on the
// header's own `recency` stamp so an unchanged session is never re-read.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb, invalidateSnapshot } from './sqlite.js'
import { discoverProfiles, profileSources, exists, configFile, configDir } from './paths.js'
import * as sessionsScan from './scan/sessions.js'
import * as bubblesScan from './scan/bubbles.js'
import { scanWorkspaces, workspaceIndexFromScan } from './scan/workspaces.js'
import { indexTranscripts, readTranscript, transcriptOutcome, buildToolInputQueues } from './scan/transcripts.js'
import { indexInlineDiffs } from './scan/inlineDiffs.js'
import { readContent, readOfsContent } from './scan/content.js'
import { scanAiTracking } from './scan/aiTracking.js'
import { searchConversations } from './scan/search.js'
import * as N from './normalize.js'
import * as M from './metrics.js'
import { applySessionFilters, paginate } from './filters.js'
import { fetchLivePricing } from './priceScraper.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultPricingPath = path.join(__dirname, 'pricing.json')

function loadJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

const MAX_PLAUSIBLE_TOOL_DURATION_MS = 30 * 60_000 // 30 minutes

/** Cursor records when a tool call started but never when it finished.
 * The gap to the *next* message's `createdAt` (a new bubble is only
 * created once the tool's result comes back) is the closest available
 * proxy — capped generously so a long thinking pause before the next
 * message doesn't masquerade as tool runtime. */
function backfillToolDurations(messages) {
  for (let i = 0; i < messages.length; i++) {
    const tool = messages[i].toolCalls[0]
    if (!tool) continue
    const next = messages[i + 1]
    if (!messages[i].createdAt || !next?.createdAt) continue
    const start = new Date(messages[i].createdAt).getTime()
    const end = new Date(next.createdAt).getTime()
    const durationMs = end - start
    if (durationMs >= 0 && durationMs <= MAX_PLAUSIBLE_TOOL_DURATION_MS) tool.durationMs = durationMs
  }
}

/** Joins `originalFileStates` (Cursor's per-file "did we create it, what's
 * the pre-edit content key" record) against every edit-kind tool call that
 * touched that path, so the Changes tab can show one row per file rather
 * than one row per tool call. */
function buildFileChanges(detail, allToolCalls) {
  const editsByPath = new Map()
  for (const t of allToolCalls) {
    if (t.kind !== 'edit' || !t.detail?.path) continue
    if (!editsByPath.has(t.detail.path)) editsByPath.set(t.detail.path, [])
    editsByPath.get(t.detail.path).push(t)
  }

  const originalFileStates = detail.originalFileStates || {}
  const paths = new Set([...Object.keys(originalFileStates), ...editsByPath.keys()])

  return [...paths].map((filePath) => {
    const edits = editsByPath.get(filePath) || []
    const ofs = originalFileStates[filePath] || null
    return {
      path: filePath,
      isNewlyCreated: ofs?.isNewlyCreated ?? (edits.length > 0 && !ofs),
      editCount: edits.length,
      added: edits.reduce((n, e) => n + (e.detail?.added || 0), 0),
      removed: edits.reduce((n, e) => n + (e.detail?.removed || 0), 0),
      beforeContentId: edits[0]?.detail?.beforeContentId ?? null,
      afterContentId: edits[edits.length - 1]?.detail?.afterContentId ?? null,
      ofsContentKey: ofs?.contentKey ?? null,
    }
  })
}

function extOf(filePath) {
  if (typeof filePath !== 'string' || !filePath) return null
  const ext = path.extname(filePath)
  return ext ? ext.slice(1).toLowerCase() : null
}

export class Store {
  constructor({ dataDir } = {}) {
    this.dataDir = dataDir
    this.profiles = []
    this.pricing = loadJsonSafe(defaultPricingPath, { models: {} })
    this.sessions = [] // enriched, recency desc
    this.sessionMeta = new Map() // id -> { header, profile, sources }
    this.messagesById = new Map() // id -> normalized message[]
    this.workspaceIndex = new Map() // workspaceId -> folderPath
    this.workspaceActivity = []
    this.transcriptIndex = new Map() // composerId -> jsonl path
    this.aiTracking = null
    this.sourceHealth = []
    this.lastRefreshedAt = null
    this.refreshing = null
    this.listeners = new Set()

    this._detailReuse = new Map() // id -> { recency, session, messages }
    this._toolBreakdownCache = null
  }

  onChange(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emitChange(scope) {
    for (const fn of this.listeners) {
      try {
        fn(scope)
      } catch {
        /* listener errors shouldn't break the refresh cycle */
      }
    }
  }

  applyPricingOverride() {
    const userCfg = loadJsonSafe(configFile, null)
    if (userCfg?.pricing?.models) {
      this.pricing = {
        ...this.pricing,
        models: { ...this.pricing.models, ...userCfg.pricing.models },
      }
    }
  }

  async setPricingOverride(models) {
    const existing = loadJsonSafe(configFile, {})
    // A manual edit always wins over whatever is already on disk.
    const merged = { ...(existing.pricing?.models || {}), ...models }
    await this._writePricingConfig(merged)
  }

  /** Best-effort refresh of per-model rates from Cursor's published pricing
   * docs (see priceScraper.js). This is a deliberate overwrite: any model
   * the docs page has a current rate for replaces whatever was there before
   * — including a manually-typed value — since "refresh" is meant to pull
   * in the latest published numbers as the new source of truth. Manually
   * set rates for models the docs page doesn't list (or no longer lists)
   * are left alone. */
  async refreshPricingFromDocs() {
    const result = await fetchLivePricing()
    if (!result.ok) return result

    const existing = loadJsonSafe(configFile, {})
    const manualModels = existing.pricing?.models || {}
    const merged = { ...manualModels, ...result.models }
    await this._writePricingConfig(merged)

    return {
      ok: true,
      updatedCount: Object.keys(result.models).length,
      fetchedAt: result.fetchedAt,
      sourceUrl: result.sourceUrl,
    }
  }

  async _writePricingConfig(models) {
    fs.mkdirSync(configDir, { recursive: true })
    const existing = loadJsonSafe(configFile, {})
    const next = { ...existing, pricing: { models } }
    fs.writeFileSync(configFile, JSON.stringify(next, null, 2))
    this.applyPricingOverride()
    // Cost is derived at enrich time and cached per-session keyed on the
    // header's `recency` stamp, which a pricing change doesn't touch — so
    // the reuse cache must be dropped explicitly or stale $0/unpriced
    // figures would survive the refresh.
    this._detailReuse.clear()
    await this.refresh()
  }

  async init() {
    this.applyPricingOverride()
    await this.refresh()
  }

  /** User-triggered refresh (the sidebar/topbar button). Forces every
   * snapshot to be re-copied and every session re-read, rather than
   * trusting the mtime/size fingerprint — the honest response to someone
   * explicitly asking "is this current?". */
  async forceRefresh() {
    for (const profile of this.profiles) {
      const sources = profileSources(profile)
      invalidateSnapshot(sources.globalStateDb)
      invalidateSnapshot(sources.aiTrackingDb)
      invalidateSnapshot(sources.conversationSearchDb)
    }
    this._detailReuse.clear()
    await this.refresh()
  }

  /** Full rebuild. Cheap in practice: each session is only re-read from
   * disk when its header's `recency` stamp has actually moved. Concurrent
   * callers (the poll-based watcher and a user-triggered refresh landing
   * at the same moment) share one in-flight run rather than racing. */
  async refresh() {
    if (this.refreshing) return this.refreshing
    this.refreshing = this._doRefresh().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  async _doRefresh() {
    this.profiles = discoverProfiles(this.dataDir)
    const health = []
    const workspaceActivityRaw = []

    for (const profile of this.profiles) {
      const sources = profileSources(profile)
      const ws = await scanWorkspaces(sources)
      workspaceActivityRaw.push(...ws)
      health.push({
        profile: profile.label,
        source: 'workspaceStorage',
        ok: exists(sources.workspaceStorageDir),
        path: sources.workspaceStorageDir,
      })
    }
    this.workspaceIndex = workspaceIndexFromScan(workspaceActivityRaw)
    this.workspaceActivity = workspaceActivityRaw.map(N.normalizeWorkspaceActivity)

    const nextReuse = new Map()
    const nextSessions = []
    const nextMeta = new Map()
    const nextTranscriptIndex = new Map()
    const nextMessagesById = new Map()
    let aiTracking = null

    for (const profile of this.profiles) {
      const sources = profileSources(profile)

      // Built before the session loop (a directory scan, not a DB read) so
      // each session can be cross-referenced against its own transcript —
      // both to backfill any tool-call arg the DB copy left empty and to
      // report the transcript's terminal status/error.
      const tIndex = indexTranscripts(sources.projectsDir)
      for (const [id, file] of tIndex) nextTranscriptIndex.set(id, file)

      const db = await openDb(sources.globalStateDb)
      health.push({ profile: profile.label, source: 'globalState', ok: !!db, path: sources.globalStateDb })

      if (db) {
        const headers = sessionsScan.readSessionHeaders(db)
        const inlineDiffs = indexInlineDiffs(db)

        for (const header of headers) {
          if (header.composerId === 'empty-state-draft') continue // Cursor's scratch buffer, not a real session

          const cacheKey = `${profile.id}:${header.composerId}`
          const prior = this._detailReuse.get(cacheKey)
          let enriched
          let messages

          if (prior && prior.recency === header.recency) {
            enriched = prior.session
            messages = prior.messages
          } else {
            const composerData = sessionsScan.readComposerData(db, header.composerId)
            const detail = N.normalizeSessionDetail(header, composerData, this.workspaceIndex)
            const bubbleIds = detail.messageHeaders.map((h) => h.bubbleId)
            const bubbles = bubblesScan.readBubbles(db, header.composerId, bubbleIds)
            messages = detail.messageHeaders
              .map((h, i) => {
                const raw = bubbles.get(h.bubbleId)
                return raw ? N.normalizeMessage(raw, { index: i, sessionId: header.composerId }) : null
              })
              .filter(Boolean)

            // Cursor only stamps `modelInfo` on a small minority of bubbles
            // (often just the first). Falling back to the session's own
            // model config — always present — means cost/model breakdowns
            // aren't needlessly bucketed under "unknown" for the common
            // case of a session that used one model throughout.
            const sessionModel = detail.modelConfig?.modelName || null
            if (sessionModel) {
              for (const m of messages) {
                if (!m.model) {
                  m.model = sessionModel
                  m.modelSource = 'inferred'
                }
              }
            }

            backfillToolDurations(messages)
            const allToolCalls = messages.flatMap((m) => m.toolCalls)

            // Backfill any tool call whose DB-stored args came back empty
            // from the raw agent transcript, when one exists for this session.
            const transcriptFile = tIndex.get(header.composerId)
            if (transcriptFile) {
              const toolInputQueues = buildToolInputQueues(readTranscript(transcriptFile))
              for (const t of allToolCalls) {
                if (t.args != null) continue
                const queue = toolInputQueues.get(t.name)
                if (queue?.length) t.args = queue.shift()
              }
            }

            // What Cursor actually applied to disk, when it differs from
            // the tool call's own precomputed preview.
            for (const t of allToolCalls) {
              if (t.kind === 'edit' && t.id && inlineDiffs.has(t.id)) {
                const applied = inlineDiffs.get(t.id)
                t.detail = { ...t.detail, appliedDiffId: applied.diffId, appliedGenerationId: applied.generationUUID }
              }
            }

            enriched = M.enrichSession(detail, detail, messages, this.pricing)
            enriched.toolNames = [...new Set(messages.flatMap((m) => m.toolCalls.map((t) => t.name)))]
            enriched.fileExtensions = [
              ...new Set(
                [...(detail.filesTouched || []), ...(detail.newlyCreatedFiles || [])]
                  .map(extOf)
                  .filter(Boolean)
              ),
            ]
            enriched.fileChanges = buildFileChanges(detail, allToolCalls)
          }

          nextReuse.set(cacheKey, { recency: header.recency, session: enriched, messages })
          nextSessions.push(enriched)
          nextMeta.set(header.composerId, { header, profile, sources, cacheKey })
          nextMessagesById.set(header.composerId, messages)
        }
        db.close()
      }

      health.push({
        profile: profile.label,
        source: 'agentTranscripts',
        ok: tIndex.size > 0,
        path: sources.projectsDir,
      })
      health.push({
        profile: profile.label,
        source: 'conversationSearch',
        ok: exists(sources.conversationSearchDb),
        path: sources.conversationSearchDb,
      })
      health.push({
        profile: profile.label,
        source: 'aiTracking',
        ok: exists(sources.aiTrackingDb),
        path: sources.aiTrackingDb,
      })

      if (!aiTracking) {
        aiTracking = await scanAiTracking(sources)
      }
    }

    nextSessions.sort((a, b) => (b.recency ?? 0) - (a.recency ?? 0))

    this._detailReuse = nextReuse
    this.sessions = nextSessions
    this.sessionMeta = nextMeta
    this.messagesById = nextMessagesById
    this.transcriptIndex = nextTranscriptIndex
    this.sourceHealth = health
    this.aiTracking = aiTracking
    this.lastRefreshedAt = Date.now()
    this._toolBreakdownCache = null

    this.emitChange('all')
  }

  getMeta() {
    return {
      platform: process.platform,
      profiles: this.profiles.map((p) => ({ id: p.id, label: p.label, userDir: p.userDir })),
      sourceHealth: this.sourceHealth,
      sessionCount: this.sessions.length,
      lastRefreshedAt: this.lastRefreshedAt,
    }
  }

  listSessions(query) {
    const filtered = applySessionFilters(this.sessions, query)
    return paginate(filtered, query)
  }

  getSession(id) {
    return this.sessions.find((s) => s.id === id) || null
  }

  getMessages(id, query = {}) {
    const all = this.messagesById.get(id) || []
    // A single Cursor session can run to several thousand bubbles; the
    // default 500-item cap exists for listSessions()'s sake, not this.
    return paginate(all, query, { maxLimit: 200_000 })
  }

  getTranscriptOutcome(id) {
    const file = this.transcriptIndex.get(id)
    if (!file) return null
    const entries = readTranscript(file)
    return { ...transcriptOutcome(entries), entryCount: entries.length }
  }

  getFileChanges(id) {
    return this.getSession(id)?.fileChanges || []
  }

  /** Lazily reads one content-addressed blob for a session — a full
   * before/after file body — rather than inlining every touched file's
   * complete text into the session payload on every load. `key` must be a
   * `composer.content.<sha256>` or `ofsContent:…` row; anything else is
   * rejected so this can't be used to fetch arbitrary `cursorDiskKV` rows. */
  async getContent(id, key) {
    if (!/^composer\.content\.[0-9a-f]+$/.test(key) && !key.startsWith('ofsContent:')) return null
    const meta = this.sessionMeta.get(id)
    if (!meta) return null
    const db = await openDb(meta.sources.globalStateDb)
    if (!db) return null
    try {
      return key.startsWith('ofsContent:') ? readOfsContent(db, key) : readContent(db, key)
    } finally {
      db.close()
    }
  }

  getOverview() {
    return M.overviewRollup(this.sessions)
  }

  getTimeline(unit) {
    return M.timelineBuckets(this.sessions, { unit })
  }

  getModelBreakdown() {
    return M.modelBreakdown(this.sessions)
  }

  getToolBreakdown() {
    if (!this._toolBreakdownCache) {
      const allMessages = [...this.messagesById.values()].flat()
      this._toolBreakdownCache = M.toolBreakdown(allMessages)
    }
    return this._toolBreakdownCache
  }

  getContextPressure() {
    return M.contextPressure(this.sessions)
  }

  /** The session actively generating right now, if any — Cursor exposes
   * this nowhere in its own UI. Preference order: a non-empty
   * `generatingBubbleIds` (the strongest signal), then
   * `isContinuationInProgress` (seen on some agent backends instead), then
   * — so the page never looks broken the instant a turn ends — the most
   * recently active session if it updated within the last 30s. */
  getLiveState() {
    const RECENT_WINDOW_MS = 30_000
    const empty = {
      sessionId: null,
      isGenerating: false,
      startedAt: null,
      generatingBubbleIds: [],
      queuedPrompts: [],
      lastEventAt: this.lastRefreshedAt,
    }

    const generating = this.sessions.find((s) => (s.generatingBubbleIds || []).length > 0)
    if (generating) {
      return {
        sessionId: generating.id,
        isGenerating: true,
        startedAt: generating.lastUpdatedAt ?? null,
        generatingBubbleIds: generating.generatingBubbleIds,
        queuedPrompts: generating.queuedPrompts || [],
        lastEventAt: this.lastRefreshedAt,
      }
    }

    const continuing = this.sessions.find((s) => s.isContinuationInProgress)
    if (continuing) {
      return {
        sessionId: continuing.id,
        isGenerating: true,
        startedAt: continuing.lastUpdatedAt ?? null,
        generatingBubbleIds: [],
        queuedPrompts: continuing.queuedPrompts || [],
        lastEventAt: this.lastRefreshedAt,
      }
    }

    const mostRecent = this.sessions[0]
    if (mostRecent?.lastUpdatedAt && Date.now() - mostRecent.lastUpdatedAt < RECENT_WINDOW_MS) {
      return {
        sessionId: mostRecent.id,
        isGenerating: false,
        startedAt: null,
        generatingBubbleIds: [],
        queuedPrompts: mostRecent.queuedPrompts || [],
        lastEventAt: this.lastRefreshedAt,
      }
    }

    return empty
  }

  getWorkspaces() {
    const byId = new Map()
    for (const w of this.workspaceActivity) byId.set(w.workspaceId, { ...w, sessionCount: 0, tokens: 0, costUsd: 0 })
    for (const s of this.sessions) {
      const w = byId.get(s.workspaceId)
      if (w) {
        w.sessionCount++
        w.tokens += s.tokens.total
        w.costUsd += s.cost.usd
      }
    }
    return [...byId.values()].sort((a, b) => b.sessionCount - a.sessionCount)
  }

  getAiTracking() {
    if (!this.aiTracking) return null
    return {
      ...this.aiTracking,
      fileExtensionBreakdown: M.fileExtensionBreakdown(this.aiTracking.hashesByDay),
    }
  }

  async search(q) {
    const results = []
    for (const profile of this.profiles) {
      const sources = profileSources(profile)
      const fts = await searchConversations(sources, q)
      if (fts) results.push(...fts)
    }
    if (results.length > 0) return results

    // FTS unavailable/stale — fall back to a linear scan across names,
    // subtitles, and message text already sitting in memory.
    const needle = (q || '').toLowerCase()
    if (!needle) return []
    const hits = []
    for (const s of this.sessions) {
      const inSummary = (s.name || '').toLowerCase().includes(needle) || (s.subtitle || '').toLowerCase().includes(needle)
      if (inSummary) {
        hits.push({ id: s.id, title: s.name || s.subtitle, updatedAt: s.lastUpdatedAt })
        continue
      }
      const messages = this.messagesById.get(s.id) || []
      if (messages.some((m) => m.text?.toLowerCase().includes(needle))) {
        hits.push({ id: s.id, title: s.name || s.subtitle, updatedAt: s.lastUpdatedAt })
      }
    }
    return hits
  }

  /** Absolute paths currently backing the index, for the mtime watcher.
   * Includes WAL/SHM siblings (the actual files a live Cursor write lands
   * in) and every currently-indexed agent-transcript file, so a running
   * agent turn — which only appends to its .jsonl — is noticed too. */
  watchTargets() {
    const targets = []
    for (const profile of this.profiles) {
      const sources = profileSources(profile)
      targets.push(
        sources.globalStateDb,
        sources.globalStateDb + '-wal',
        sources.globalStateDb + '-shm',
        sources.aiTrackingDb,
        sources.aiTrackingDb + '-wal',
        sources.conversationSearchDb,
        sources.conversationSearchDb + '-wal'
      )
    }
    for (const file of this.transcriptIndex.values()) targets.push(file)
    return targets.filter(exists)
  }
}
