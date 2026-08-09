// Session (aka "composer") headers from the global state store.
//
// Modern Cursor keeps a dedicated `composerHeaders` table for fast listing.
// Older builds never wrote that table — they only ever had `composerData:*`
// entries in `cursorDiskKV`, so we fall back to enumerating those directly
// when the table is missing or empty.

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

export function readSessionHeaders(db) {
  if (!db) return []

  let rows = []
  if (db.tableExists('composerHeaders')) {
    rows = db.all(
      `SELECT composerId, workspaceId, createdAt, lastUpdatedAt, isArchived,
              isSubagent, recency, checkpointAt, value
       FROM composerHeaders`
    )
  }

  if (rows.length > 0) {
    return rows.map((row) => ({ ...row, value: safeJsonParse(row.value, {}) }))
  }

  // Fallback path for pre-table Cursor versions.
  const kvRows = db.all(`SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'`)
  return kvRows
    .map(({ key, value }) => {
      const composerId = key.slice('composerData:'.length)
      const v = safeJsonParse(value, null)
      if (!v) return null
      return {
        composerId,
        workspaceId: v.workspaceIdentifier?.id ?? null,
        createdAt: v.createdAt ?? null,
        lastUpdatedAt: v.lastUpdatedAt ?? null,
        isArchived: 0,
        isSubagent: 0,
        recency: v.lastUpdatedAt ?? v.createdAt ?? 0,
        checkpointAt: v.conversationCheckpointLastUpdatedAt ?? null,
        value: v,
      }
    })
    .filter(Boolean)
}

export function readComposerData(db, composerId) {
  if (!db) return null
  const row = db.get(`SELECT value FROM cursorDiskKV WHERE key = ?`, [`composerData:${composerId}`])
  if (!row) return null
  return safeJsonParse(row.value, null)
}
