// Raw Cursor store shapes -> stable Session / Message / ToolCall shapes the
// rest of the server and the whole frontend build against. Pure functions,
// no I/O: everything here takes already-parsed JS objects.

function safeParseMaybeJson(value) {
  if (typeof value !== 'string') return value ?? null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function estimateTokensFromChars(len) {
  if (!len) return 0
  return Math.max(1, Math.round(len / 4))
}

function pathBasename(p) {
  if (!p) return null
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || p
}

export function normalizeToolCall(tf) {
  if (!tf) return null
  return {
    id: tf.toolCallId ?? null,
    name: tf.name || tf.tool || 'unknown',
    status: tf.status || 'unknown',
    args: safeParseMaybeJson(tf.params) ?? safeParseMaybeJson(tf.rawArgs) ?? null,
    result: safeParseMaybeJson(tf.result),
  }
}

export function normalizeMessage(raw, { index, sessionId }) {
  const toolCalls = raw.toolFormerData ? [normalizeToolCall(raw.toolFormerData)] : []

  const tc = raw.tokenCount || {}
  const rawInput = tc.inputTokens || 0
  const rawOutput = tc.outputTokens || 0
  const hasMeasured = rawInput > 0 || rawOutput > 0

  let inputTokens = rawInput
  let outputTokens = rawOutput
  let tokenSource = 'measured'

  if (!hasMeasured) {
    // Most agentic turns carry no user-visible `text` at all — the real
    // payload is tool call args/results (what the model actually read and
    // wrote). Counting only `text` would undercount by an order of
    // magnitude, so the estimate includes tool call and code block payload
    // size too. Still a rough character-based heuristic, always tagged
    // `estimated` and never treated as billing-accurate.
    const isUser = raw.type === 1
    const textLen = (raw.text || '').length
    const thinkingLen = (raw.thinking?.text || '').length
    const codeLen = (raw.codeBlocks || []).reduce((n, b) => n + (b.content?.length || 0), 0)
    const toolLen = toolCalls.reduce((n, t) => {
      const argsLen = typeof t.args === 'string' ? t.args.length : JSON.stringify(t.args ?? '').length
      const resultLen = typeof t.result === 'string' ? t.result.length : JSON.stringify(t.result ?? '').length
      return n + argsLen + resultLen
    }, 0)

    if (isUser) {
      inputTokens = estimateTokensFromChars(textLen)
      tokenSource = inputTokens > 0 ? 'estimated' : 'measured'
    } else {
      outputTokens = estimateTokensFromChars(textLen + thinkingLen + codeLen + toolLen)
      tokenSource = outputTokens > 0 ? 'estimated' : 'measured'
    }
  }

  let error = null
  if (raw.errorDetails) {
    const parsed = { ...raw.errorDetails }
    if (typeof parsed.error === 'string') parsed.error = safeParseMaybeJson(parsed.error)
    error = parsed
  }

  return {
    id: raw.bubbleId,
    sessionId,
    index,
    role: raw.type === 1 ? 'user' : 'assistant',
    createdAt: raw.createdAt || null,
    text: raw.text || '',
    thinking: raw.thinking?.text
      ? { text: raw.thinking.text, durationMs: raw.thinkingDurationMs || 0 }
      : null,
    toolCalls,
    codeBlocks: (raw.codeBlocks || []).map((b) => ({
      path: b.path ?? b.uri ?? null,
      languageId: b.languageId ?? null,
      content: b.content ?? null,
    })),
    model: raw.modelInfo?.modelName || null,
    modelSource: raw.modelInfo?.modelName ? 'reported' : null,
    tokens: { input: inputTokens, output: outputTokens, source: tokenSource },
    error,
    capabilityType: raw.capabilityType ?? null,
    isAgentic: !!raw.isAgentic,
  }
}

export function normalizeSessionSummary(header, workspaceIndex) {
  const v = header.value || {}
  const wi = v.workspaceIdentifier || {}
  const workspaceId = header.workspaceId ?? wi.id ?? null
  const workspacePath = wi.uri?.path || workspaceIndex?.get(workspaceId) || null

  return {
    id: header.composerId,
    workspaceId,
    workspacePath,
    workspaceName: workspacePath ? pathBasename(workspacePath) : null,
    name: v.name || null,
    subtitle: v.subtitle || null,
    mode: v.unifiedMode || 'agent',
    backend: v.agentBackend || null,
    status: v.status || null,
    createdAt: header.createdAt ?? v.createdAt ?? null,
    lastUpdatedAt: header.lastUpdatedAt ?? v.lastUpdatedAt ?? null,
    recency: header.recency ?? header.lastUpdatedAt ?? header.createdAt ?? 0,
    isArchived: !!header.isArchived,
    isSubagent: !!header.isSubagent,
    isDraft: !!v.isDraft,
    isWorktree: !!v.isWorktree,
    isSpec: !!v.isSpec,
    numSubComposers: v.numSubComposers || 0,
    linesAdded: v.totalLinesAdded || 0,
    linesRemoved: v.totalLinesRemoved || 0,
    filesChangedCount: v.filesChangedCount || 0,
    contextUsagePercent: v.contextUsagePercent ?? null,
    model: v.modelConfig?.modelName || null,
    messageCount: null, // filled in once bubbles are hydrated
  }
}

export function normalizeSessionDetail(header, composerData, workspaceIndex) {
  const summary = normalizeSessionSummary(header, workspaceIndex)
  const cd = composerData || {}
  const breakdown = cd.promptTokenBreakdown || null

  const messageHeaders = (cd.fullConversationHeadersOnly || []).map((h, i) => ({
    bubbleId: h.bubbleId,
    role: h.type === 1 ? 'user' : 'assistant',
    index: i,
    createdAt: h.createdAt || null,
    textPreview: h.grouping?.textPreview || null,
    hasThinking: !!h.grouping?.hasThinking,
    thinkingDurationMs: h.grouping?.thinkingDurationMs || 0,
    capabilityType: h.grouping?.capabilityType ?? null,
  }))

  return {
    ...summary,
    status: cd.status || summary.status,
    backend: cd.agentBackend || summary.backend,
    model: cd.modelConfig?.modelName || summary.model,
    contextTokensUsed: cd.contextTokensUsed ?? null,
    contextTokenLimit: cd.contextTokenLimit ?? null,
    contextUsagePercent: cd.contextUsagePercent ?? summary.contextUsagePercent,
    tokenBreakdown: breakdown?.categories || [],
    modelConfig: cd.modelConfig || null,
    todos: (cd.todos || []).map((t) => ({ id: t.id, content: t.content, status: t.status })),
    newlyCreatedFiles: (cd.newlyCreatedFiles || [])
      .map((f) => f.uri?.path || (f.uri?.external ? decodeURIComponent(f.uri.external.replace(/^file:\/\//, '')) : null))
      .filter(Boolean),
    filesTouched: Object.keys(cd.originalFileStates || {}).map((k) =>
      k.startsWith('file://') ? decodeURIComponent(k.replace(/^file:\/\//, '')) : k
    ),
    messageHeaders,
    messageCount: messageHeaders.length,
  }
}

export function normalizeWorkspaceActivity(w) {
  return {
    workspaceId: w.workspaceId,
    folderPath: w.folderPath,
    folderName: w.folderPath ? pathBasename(w.folderPath) : null,
    legacyGenerations: (w.generations || []).map((g) => ({
      id: g.generationUUID,
      at: g.unixMs,
      type: g.type,
      description: g.textDescription || null,
    })),
    legacyPromptCount: (w.prompts || []).length,
  }
}
