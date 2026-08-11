// Content-addressed file bodies. Cursor stores the full before/after text
// of every edit in `cursorDiskKV`, keyed by content id rather than inline
// on the edit itself — read lazily (never inlined into a session payload,
// which can otherwise run to megabytes) via the /content/:id API route.

/** `composer.content.<sha256>` rows hold a file's full text at one point
 * in time; an edit's `beforeContentId`/`afterContentId` point at these. */
export function readContent(db, contentId) {
  if (!db || !contentId) return null
  const row = db.get(`SELECT value FROM cursorDiskKV WHERE key = ?`, [contentId])
  return row ? row.value : null
}

/** `ofsContent:<composerId>:<fileUri>` rows hold a file's content as it
 * stood the moment Cursor first touched it in the session — the "original"
 * half of a diff for files that predate the session's own edit history. */
export function readOfsContent(db, contentKey) {
  if (!db || !contentKey) return null
  const row = db.get(`SELECT value FROM cursorDiskKV WHERE key = ?`, [contentKey])
  return row ? row.value : null
}
