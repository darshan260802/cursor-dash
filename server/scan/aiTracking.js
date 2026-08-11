// AI code-authorship tracking: which lines in your repos came from Cursor
// vs. from you, tracked per commit and per generated file hash.

import { openDb } from '../sqlite.js'

export async function scanAiTracking(sources) {
  const db = await openDb(sources.aiTrackingDb)
  if (!db) return null

  const hashesByDay = db.all(
    `SELECT date(createdAt / 1000, 'unixepoch') as day, source, fileExtension, model, COUNT(*) as count
     FROM ai_code_hashes
     GROUP BY day, source, fileExtension, model
     ORDER BY day DESC
     LIMIT 5000`
  )

  // Per-hash rows (not just the day/ext rollup above) — the join key back
  // to a Cursor session, and per-file authorship, that the rollup throws away.
  const hashes = db.all(
    `SELECT hash, source, fileExtension, fileName, requestId, conversationId, timestamp, model, createdAt
     FROM ai_code_hashes
     ORDER BY createdAt DESC
     LIMIT 20000`
  )

  const commits = db.all(
    `SELECT commitHash, branchName, scoredAt, linesAdded, linesDeleted,
            composerLinesAdded, composerLinesDeleted, tabLinesAdded, tabLinesDeleted,
            humanLinesAdded, humanLinesDeleted, commitMessage, commitDate,
            v1AiPercentage, v2AiPercentage
     FROM scored_commits
     ORDER BY scoredAt DESC
     LIMIT 1000`
  )

  const summaries = db.all(
    `SELECT conversationId, title, tldr, overview, summaryBullets, model, mode, updatedAt
     FROM conversation_summaries
     ORDER BY updatedAt DESC
     LIMIT 1000`
  )

  db.close()
  return {
    hashesByDay,
    commits,
    summaries,
    byConversation: rollupBy(hashes, (h) => h.conversationId),
    byFile: rollupBy(hashes, (h) => h.fileName),
  }
}

/** Groups AI-authored-hash rows by `keyFn`, dropping rows with no key
 * (most legacy rows predate one or the other id being recorded). */
function rollupBy(hashes, keyFn) {
  const byKey = new Map()
  for (const h of hashes) {
    const key = keyFn(h)
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, { key, count: 0, fileExtensions: new Set(), models: new Set() })
    const entry = byKey.get(key)
    entry.count += 1
    if (h.fileExtension) entry.fileExtensions.add(h.fileExtension)
    if (h.model) entry.models.add(h.model)
  }
  return [...byKey.values()]
    .map((e) => ({ key: e.key, count: e.count, fileExtensions: [...e.fileExtensions], models: [...e.models] }))
    .sort((a, b) => b.count - a.count)
}
