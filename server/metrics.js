// Pure computation over normalized sessions/messages: token rollups with
// honest provenance, cost estimation, and the aggregates that back the
// Analytics routes. No I/O — everything here takes already-hydrated data.

function normalizeModelKey(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Resolve a model name to a pricing entry, trying exact then fuzzy match. */
export function resolveModelPricing(modelName, pricingTable) {
  if (!modelName || !pricingTable?.models) return null
  const models = pricingTable.models
  if (models[modelName]) return models[modelName]

  const key = normalizeModelKey(modelName)
  for (const [name, entry] of Object.entries(models)) {
    const candidate = normalizeModelKey(name)
    if (key === candidate || key.includes(candidate) || candidate.includes(key)) return entry
  }
  return null
}

/** Aggregate token counts + provenance for a flat list of normalized messages. */
export function tokensForMessages(messages) {
  const totals = { input: 0, output: 0, measured: 0, estimated: 0 }
  for (const m of messages) {
    totals.input += m.tokens.input
    totals.output += m.tokens.output
    const sum = m.tokens.input + m.tokens.output
    if (m.tokens.source === 'measured') totals.measured += sum
    else totals.estimated += sum
  }
  return { ...totals, total: totals.input + totals.output }
}

/**
 * Estimate USD cost for a message list. Messages on unpriced models are
 * tallied separately (`unpricedTokens`) rather than silently costed at $0.
 */
export function costForMessages(messages, pricingTable) {
  let usd = 0
  let unpricedTokens = 0
  let anyPriced = false
  let anyEstimatedTokens = false
  const byModel = new Map()

  for (const m of messages) {
    const rate = resolveModelPricing(m.model, pricingTable)
    const modelKey = m.model || 'unknown'
    if (!byModel.has(modelKey)) {
      byModel.set(modelKey, { model: modelKey, inputTokens: 0, outputTokens: 0, usd: 0, priced: false })
    }
    const entry = byModel.get(modelKey)
    entry.inputTokens += m.tokens.input
    entry.outputTokens += m.tokens.output

    if (m.tokens.source === 'estimated') anyEstimatedTokens = true

    if (rate && (rate.input != null || rate.output != null)) {
      const cost = (m.tokens.input * (rate.input || 0) + m.tokens.output * (rate.output || 0)) / 1_000_000
      usd += cost
      entry.usd += cost
      entry.priced = true
      anyPriced = true
    } else {
      unpricedTokens += m.tokens.input + m.tokens.output
    }
  }

  let source = 'unpriced'
  if (anyPriced && unpricedTokens === 0) source = anyEstimatedTokens ? 'estimated' : 'measured'
  else if (anyPriced) source = 'partial'

  return { usd, unpricedTokens, source, byModel: [...byModel.values()] }
}

/** Combine a session's detail + hydrated messages into one enriched record. */
export function enrichSession(summary, detail, messages, pricingTable) {
  const tokens = tokensForMessages(messages)
  const cost = costForMessages(messages, pricingTable)
  const toolCalls = messages.flatMap((m) => m.toolCalls)
  const errorMessages = messages.filter((m) => m.error)
  const durationMs =
    summary.lastUpdatedAt && summary.createdAt ? summary.lastUpdatedAt - summary.createdAt : null

  return {
    ...(detail || summary),
    messageCount: messages.length,
    toolCallCount: toolCalls.length,
    toolCallErrorCount: toolCalls.filter((t) => t.status === 'error').length,
    errorCount: errorMessages.length,
    durationMs,
    tokens,
    cost,
  }
}

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

export function overviewRollup(enrichedSessions) {
  const acc = {
    sessionCount: enrichedSessions.length,
    activeSessionCount: 0,
    messageCount: 0,
    toolCallCount: 0,
    toolCallErrorCount: 0,
    errorCount: 0,
    linesAdded: 0,
    linesRemoved: 0,
    filesChangedCount: 0,
    tokens: { input: 0, output: 0, total: 0, measured: 0, estimated: 0 },
    costUsd: 0,
    unpricedTokens: 0,
    workspaces: new Set(),
    activeDays: new Set(),
  }

  for (const s of enrichedSessions) {
    if (s.messageCount > 0) acc.activeSessionCount++
    acc.messageCount += s.messageCount
    acc.toolCallCount += s.toolCallCount
    acc.toolCallErrorCount += s.toolCallErrorCount
    acc.errorCount += s.errorCount
    acc.linesAdded += s.linesAdded || 0
    acc.linesRemoved += s.linesRemoved || 0
    acc.filesChangedCount += s.filesChangedCount || 0
    acc.tokens.input += s.tokens.input
    acc.tokens.output += s.tokens.output
    acc.tokens.total += s.tokens.total
    acc.tokens.measured += s.tokens.measured
    acc.tokens.estimated += s.tokens.estimated
    acc.costUsd += s.cost.usd
    acc.unpricedTokens += s.cost.unpricedTokens
    if (s.workspaceName) acc.workspaces.add(s.workspaceName)
    if (s.createdAt) acc.activeDays.add(dayKey(s.createdAt))
  }

  return {
    ...acc,
    workspaceCount: acc.workspaces.size,
    activeDayCount: acc.activeDays.size,
    workspaces: undefined,
    activeDays: undefined,
  }
}

export function timelineBuckets(enrichedSessions, { unit = 'day' } = {}) {
  const buckets = new Map()
  const keyFor = (ms) => {
    const d = new Date(ms)
    if (unit === 'week') {
      const day = new Date(d)
      day.setUTCDate(day.getUTCDate() - day.getUTCDay())
      return day.toISOString().slice(0, 10)
    }
    return dayKey(ms)
  }

  for (const s of enrichedSessions) {
    if (!s.createdAt) continue
    const key = keyFor(s.createdAt)
    if (!buckets.has(key)) {
      buckets.set(key, {
        date: key,
        sessions: 0,
        messages: 0,
        tokens: 0,
        costUsd: 0,
        linesAdded: 0,
        linesRemoved: 0,
      })
    }
    const b = buckets.get(key)
    b.sessions++
    b.messages += s.messageCount
    b.tokens += s.tokens.total
    b.costUsd += s.cost.usd
    b.linesAdded += s.linesAdded || 0
    b.linesRemoved += s.linesRemoved || 0
  }

  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function modelBreakdown(enrichedSessions) {
  const byModel = new Map()
  for (const s of enrichedSessions) {
    for (const entry of s.cost.byModel) {
      if (!byModel.has(entry.model)) {
        byModel.set(entry.model, {
          model: entry.model,
          sessions: 0,
          inputTokens: 0,
          outputTokens: 0,
          usd: 0,
          priced: entry.priced,
        })
      }
      const b = byModel.get(entry.model)
      b.sessions++
      b.inputTokens += entry.inputTokens
      b.outputTokens += entry.outputTokens
      b.usd += entry.usd
      b.priced = b.priced || entry.priced
    }
  }
  return [...byModel.values()].sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens))
}

export function toolBreakdown(allMessages) {
  const byTool = new Map()
  for (const m of allMessages) {
    for (const t of m.toolCalls) {
      if (!byTool.has(t.name)) {
        byTool.set(t.name, { name: t.name, count: 0, errorCount: 0 })
      }
      const b = byTool.get(t.name)
      b.count++
      if (t.status === 'error') b.errorCount++
    }
  }
  return [...byTool.values()].sort((a, b) => b.count - a.count)
}

/** Small-multiples input: per-session context-budget category breakdown. */
export function contextPressure(enrichedSessions) {
  return enrichedSessions
    .filter((s) => s.tokenBreakdown && s.tokenBreakdown.length > 0)
    .map((s) => ({
      id: s.id,
      name: s.name || s.subtitle || s.id,
      contextUsagePercent: s.contextUsagePercent,
      contextTokensUsed: s.contextTokensUsed,
      contextTokenLimit: s.contextTokenLimit,
      categories: s.tokenBreakdown,
    }))
}

export function fileExtensionBreakdown(hashesByDay) {
  const byExt = new Map()
  for (const row of hashesByDay || []) {
    const ext = row.fileExtension || 'other'
    if (!byExt.has(ext)) byExt.set(ext, { extension: ext, count: 0 })
    byExt.get(ext).count += row.count
  }
  return [...byExt.values()].sort((a, b) => b.count - a.count)
}
