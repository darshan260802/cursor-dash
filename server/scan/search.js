// Full-text search over conversations via Cursor's own FTS5 index. Falls
// back to null when the DB is missing/stale, letting the caller do a plain
// in-memory scan over already-loaded session summaries instead.

import { openDb } from '../sqlite.js'

export async function searchConversations(sources, query, limit = 100) {
  const trimmed = (query || '').trim()
  if (!trimmed) return null

  const db = await openDb(sources.conversationSearchDb)
  if (!db) return null

  // Quote each token so punctuation in the query can't break FTS5 syntax,
  // then AND them together (FTS5's implicit default).
  const matchQuery = trimmed
    .split(/\s+/)
    .map((tok) => `"${tok.replace(/"/g, '""')}"*`)
    .join(' ')

  const rows = db.all(
    `SELECT c.id, c.title, c.updated_at
     FROM conversation_fts f
     JOIN conversations c ON c.fts_rowid = f.rowid
     WHERE conversation_fts MATCH ?
     ORDER BY c.updated_at DESC
     LIMIT ?`,
    [matchQuery, limit]
  )
  db.close()
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }))
}
