// Individual chat messages ("bubbles") for a session.
//
// Each bubble lives at cursorDiskKV key `bubbleId:<composerId>:<bubbleId>`.
// A session with 80+ messages means 80+ point lookups, so batch them with
// `IN (...)` — chunked, since SQLite caps bound parameters around 999.

const CHUNK_SIZE = 400

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/** @returns {Map<string, object>} bubbleId -> parsed bubble */
export function readBubbles(db, composerId, bubbleIds) {
  const out = new Map()
  if (!db || bubbleIds.length === 0) return out

  const prefix = `bubbleId:${composerId}:`
  for (let i = 0; i < bubbleIds.length; i += CHUNK_SIZE) {
    const chunk = bubbleIds.slice(i, i + CHUNK_SIZE)
    const keys = chunk.map((id) => `${prefix}${id}`)
    const placeholders = keys.map(() => '?').join(',')
    const rows = db.all(`SELECT key, value FROM cursorDiskKV WHERE key IN (${placeholders})`, keys)
    for (const row of rows) {
      const bubbleId = row.key.slice(prefix.length)
      const parsed = safeJsonParse(row.value, null)
      if (parsed) out.set(bubbleId, parsed)
    }
  }
  return out
}

export function readBubble(db, composerId, bubbleId) {
  if (!db) return null
  const row = db.get(`SELECT value FROM cursorDiskKV WHERE key = ?`, [`bubbleId:${composerId}:${bubbleId}`])
  if (!row) return null
  return safeJsonParse(row.value, null)
}
