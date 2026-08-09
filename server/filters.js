// Pure filter/sort logic for the session list, shared by the API and kept
// separate from cache.js so the query semantics are easy to unit-test.

function toMs(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toBool(v) {
  return v === '1' || v === 'true' || v === true
}

export function applySessionFilters(sessions, query = {}) {
  let out = sessions

  const includeArchived = toBool(query.includeArchived)
  const includeSubagent = toBool(query.includeSubagent)
  const includeDraft = toBool(query.includeDraft)
  if (!includeArchived) out = out.filter((s) => !s.isArchived)
  if (!includeSubagent) out = out.filter((s) => !s.isSubagent)
  if (!includeDraft) out = out.filter((s) => !s.isDraft)

  if (query.q) {
    const q = String(query.q).toLowerCase()
    out = out.filter((s) => {
      return (
        (s.name || '').toLowerCase().includes(q) ||
        (s.subtitle || '').toLowerCase().includes(q) ||
        (s.workspaceName || '').toLowerCase().includes(q)
      )
    })
  }

  const from = toMs(query.from)
  const to = toMs(query.to)
  if (from != null) out = out.filter((s) => s.createdAt != null && s.createdAt >= from)
  if (to != null) out = out.filter((s) => s.createdAt != null && s.createdAt <= to)

  if (query.workspace) {
    out = out.filter((s) => s.workspaceId === query.workspace || s.workspaceName === query.workspace)
  }

  if (query.model) {
    const m = String(query.model).toLowerCase()
    out = out.filter((s) => (s.model || '').toLowerCase().includes(m))
  }

  if (query.mode) {
    out = out.filter((s) => s.mode === query.mode)
  }

  if (query.status) {
    out = out.filter((s) => (s.status || 'unknown') === query.status)
  }

  if (toBool(query.hasErrors)) {
    out = out.filter((s) => (s.errorCount || 0) > 0 || (s.toolCallErrorCount || 0) > 0)
  }

  if (toBool(query.hasToolCalls)) {
    out = out.filter((s) => (s.toolCallCount || 0) > 0)
  }

  const minTokens = toMs(query.minTokens)
  const maxTokens = toMs(query.maxTokens)
  if (minTokens != null) out = out.filter((s) => s.tokens.total >= minTokens)
  if (maxTokens != null) out = out.filter((s) => s.tokens.total <= maxTokens)

  const minLines = toMs(query.minLines)
  const maxLines = toMs(query.maxLines)
  if (minLines != null) out = out.filter((s) => (s.linesAdded || 0) + (s.linesRemoved || 0) >= minLines)
  if (maxLines != null) out = out.filter((s) => (s.linesAdded || 0) + (s.linesRemoved || 0) <= maxLines)

  if (query.tool) {
    out = out.filter((s) => s.toolNames?.includes(query.tool))
  }

  if (query.fileExtension) {
    out = out.filter((s) => s.fileExtensions?.includes(query.fileExtension))
  }

  const sortKey = query.sort || 'recency'
  const dir = query.order === 'asc' ? 1 : -1
  const sortValue = {
    recency: (s) => s.recency ?? 0,
    createdAt: (s) => s.createdAt ?? 0,
    tokens: (s) => s.tokens.total,
    cost: (s) => s.cost.usd,
    messages: (s) => s.messageCount,
    lines: (s) => (s.linesAdded || 0) + (s.linesRemoved || 0),
    duration: (s) => s.durationMs ?? 0,
  }[sortKey] || ((s) => s.recency ?? 0)

  out = [...out].sort((a, b) => (sortValue(a) - sortValue(b)) * dir)

  return out
}

export function paginate(items, query = {}) {
  const offset = Math.max(0, Number(query.offset) || 0)
  const limit = Math.min(500, Math.max(1, Number(query.limit) || 50))
  return { items: items.slice(offset, offset + limit), total: items.length, offset, limit }
}
