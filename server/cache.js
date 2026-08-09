// The in-memory index: discovers every Cursor data source, hydrates and
// normalizes it, and keeps it fresh. Everything is local and modest in
// size (a single user's Cursor history), so the whole index — sessions,
// their messages, and the cross-session rollups — is built eagerly and
// kept in memory, with per-session reuse across refreshes keyed on the
// header's own `recency` stamp so an unchanged session is never re-read.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb } from './sqlite.js'
import { discoverProfiles, profileSources, exists, configFile, configDir } from './paths.js'
import * as sessionsScan from './scan/sessions.js'
import * as bubblesScan from './scan/bubbles.js'
import { scanWorkspaces, workspaceIndexFromScan } from './scan/workspaces.js'
import { indexTranscripts, readTranscript, transcriptOutcome } from './scan/transcripts.js'
import { scanAiTracking } from './scan/aiTracking.js'
import { searchConversations } from './scan/search.js'
import * as N from './normalize.js'
import * as M from './metrics.js'
import { applySessionFilters, paginate } from './filters.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultPricingPath = path.join(__dirname, 'pricing.json')

function loadJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
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
    fs.mkdirSync(configDir, { recursive: true })
    const existing = loadJsonSafe(configFile, {})
    const next = { ...existing, pricing: { models: { ...(existing.pricing?.models || {}), ...models } } }
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

  /** Full rebuild. Cheap in practice: each session is only re-read from
   * disk when its header's `recency` stamp has actually moved. */
  async refresh() {
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
    let aiTracking = null

    for (const profile of this.profiles) {
      const sources = profileSources(profile)
      const db = await openDb(sources.globalStateDb)
      health.push({ profile: profile.label, source: 'globalState', ok: !!db, path: sources.globalStateDb })

      if (db) {
        const headers = sessionsScan.readSessionHeaders(db)
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

            enriched = M.enrichSession(detail, detail, messages, this.pricing)
            enriched.toolNames = [...new Set(messages.flatMap((m) => m.toolCalls.map((t) => t.name)))]
            enriched.fileExtensions = [
              ...new Set(
                [...(detail.filesTouched || []), ...(detail.newlyCreatedFiles || [])]
                  .map(extOf)
                  .filter(Boolean)
              ),
            ]
          }

          nextReuse.set(cacheKey, { recency: header.recency, session: enriched, messages })
          nextSessions.push(enriched)
          nextMeta.set(header.composerId, { header, profile, sources, cacheKey })
          this.messagesById.set(header.composerId, messages)
        }
        db.close()
      }

      const tIndex = indexTranscripts(sources.projectsDir)
      for (const [id, file] of tIndex) nextTranscriptIndex.set(id, file)
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
    this.transcriptIndex = nextTranscriptIndex
    this.sourceHealth = health
    this.aiTracking = aiTracking
    this.lastRefreshedAt = Date.now()

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
    return paginate(all, query)
  }

  getTranscriptOutcome(id) {
    const file = this.transcriptIndex.get(id)
    if (!file) return null
    const entries = readTranscript(file)
    return { ...transcriptOutcome(entries), entryCount: entries.length }
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
    const allMessages = [...this.messagesById.values()].flat()
    return M.toolBreakdown(allMessages)
  }

  getContextPressure() {
    return M.contextPressure(this.sessions)
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

  /** Absolute paths currently backing the index, for the mtime watcher. */
  watchTargets() {
    const targets = []
    for (const profile of this.profiles) {
      const sources = profileSources(profile)
      targets.push(sources.globalStateDb, sources.globalStateDb + '-wal')
    }
    return targets.filter(exists)
  }
}
