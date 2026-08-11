// Applied inline diffs (`inlineDiff:<workspaceId>:<uuid>` rows) — Cursor's
// own record of what it actually applied to a file, distinct from the
// tool call's `precomputedDiff` preview. Indexed by the originating tool
// call so a tool card can link out to "what Cursor actually applied".

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/** @returns {Map<string, object>} toolCallId -> inline diff record */
export function indexInlineDiffs(db) {
  const out = new Map()
  if (!db) return out
  const rows = db.all(`SELECT value FROM cursorDiskKV WHERE key LIKE 'inlineDiff:%'`)
  for (const row of rows) {
    const parsed = safeJsonParse(row.value, null)
    const toolCallId = parsed?.composerMetadata?.toolCallId
    if (toolCallId) out.set(toolCallId, parsed)
  }
  return out
}
