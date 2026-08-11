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

function decodeFileUri(uri) {
  if (typeof uri !== 'string') return null
  return uri.startsWith('file://') ? decodeURIComponent(uri.replace(/^file:\/\//, '')) : uri
}

// Cursor's own tool identifiers (read_file_v2, edit_file_v2, …) group into
// a small set of "kinds" the UI knows how to render richly. Matched by
// substring so a tool name this codebase has never seen still classifies
// sensibly instead of falling through unrecognized — and always falls back
// to 'generic' (today's raw args/result view) rather than guessing wrong.
const TOOL_KIND_PATTERNS = [
  ['edit', /edit_file|write_file|create_file|apply_patch|delete_file|multi_edit/i],
  ['terminal', /terminal|run_command|shell|execute_command|\bbash\b/i],
  ['todo', /todo/i],
  ['read', /read_file|read_lines|cat_file/i],
  ['search', /search|glob|grep|list_dir|find_files/i],
  ['web', /web_search|fetch_url|browser|url_fetch/i],
]

function classifyToolKind(name) {
  const n = name || ''
  for (const [kind, re] of TOOL_KIND_PATTERNS) {
    if (re.test(n)) return kind
  }
  return 'generic'
}

function countDiffLines(hunks, type) {
  return hunks.reduce((n, h) => n + (h.type === type ? 1 : 0), 0)
}

function buildEditDetail(params, result) {
  const path =
    decodeFileUri(params?.relativeWorkspacePath) ||
    decodeFileUri(params?.targetFile) ||
    decodeFileUri(params?.path) ||
    null
  return {
    path,
    // `hunks`/`added`/`removed` are filled in by the caller once
    // `additionalData` (which carries the precomputed diff) is parsed —
    // see normalizeToolCall below.
    hunks: [],
    added: null,
    removed: null,
    beforeContentId: result?.beforeContentId ?? null,
    afterContentId: result?.afterContentId ?? null,
  }
}

function buildTerminalDetail(params, result, additionalData) {
  // Cursor stamps `startedAtMs` right when the call is issued (it turns
  // out to predate the owning bubble's own `createdAt` by only ~1ms — that
  // bubble is created at dispatch time, not completion), and records no
  // completion time anywhere. A real duration is filled in by
  // Store.refresh() from the gap to the *next* message instead — see
  // `backfillToolDurations` in cache.js.
  return {
    command: params?.command ?? null,
    cwd: params?.cwd || null,
    output: typeof result?.output === 'string' ? result.output : null,
    rejected: !!result?.rejected,
    startedAtMs: additionalData?.startedAtMs ?? null,
  }
}

function buildReadDetail(params, result) {
  return {
    path: decodeFileUri(params?.targetFile) || decodeFileUri(params?.path) || null,
    offset: params?.offset ?? params?.startLine ?? null,
    limit: params?.limit ?? null,
    totalLinesInFile: result?.totalLinesInFile ?? null,
  }
}

function buildSearchDetail(params, result) {
  const pattern = params?.globPattern || params?.query || params?.pattern || params?.regex || null
  const targetDirectory = decodeFileUri(params?.targetDirectory) || decodeFileUri(params?.path) || null
  const files = (result?.directories || []).flatMap((d) => (d.files || []).map((f) => f.relPath).filter(Boolean))
  const matches = files.length > 0 ? files : Array.isArray(result?.matches) ? result.matches : []
  return {
    pattern,
    targetDirectory,
    matchCount: matches.length,
    matches: matches.slice(0, 200),
  }
}

function buildTodoDetail(result) {
  const todos = Array.isArray(result?.finalTodos) ? result.finalTodos : []
  return {
    todos: todos.map((t) => ({ id: t.id ?? null, content: t.content ?? '', status: t.status ?? 'pending' })),
  }
}

export function normalizeToolCall(tf) {
  if (!tf) return null
  const name = tf.name || tf.tool || 'unknown'
  const kind = classifyToolKind(name)
  const params = safeParseMaybeJson(tf.params)
  const rawArgs = safeParseMaybeJson(tf.rawArgs)
  const result = safeParseMaybeJson(tf.result)
  const additionalData = safeParseMaybeJson(tf.additionalData)
  const args = params ?? rawArgs ?? null

  let detail = null
  if (kind === 'edit') {
    detail = buildEditDetail(params, result)
    const diffLines = additionalData?.precomputedDiff?.lines
    if (Array.isArray(diffLines)) {
      detail.hunks = diffLines.map((l) => ({
        type: l.type || 'unchanged',
        content: l.content ?? '',
        oldLine: l.originalLineNumber ?? null,
        newLine: l.modifiedLineNumber ?? null,
      }))
      detail.added = countDiffLines(detail.hunks, 'added')
      detail.removed = countDiffLines(detail.hunks, 'removed')
    }
  } else if (kind === 'terminal') {
    detail = buildTerminalDetail(params, result, additionalData)
  } else if (kind === 'read') {
    detail = buildReadDetail(params, result)
  } else if (kind === 'search') {
    detail = buildSearchDetail(params, result)
  } else if (kind === 'todo') {
    detail = buildTodoDetail(result)
  }

  return {
    id: tf.toolCallId ?? null,
    name,
    kind,
    status: tf.status || 'unknown',
    startedAtMs: additionalData?.startedAtMs ?? null,
    // Filled in by Store.refresh() from the gap to the next message —
    // Cursor doesn't record a completion time on the tool call itself.
    durationMs: null,
    args,
    result,
    detail,
  }
}

const ATTACHMENT_CHANNELS = [
  ['fileSelections', 'file'],
  ['folderSelections', 'folder'],
  ['selectedImages', 'image'],
  ['selectedVideos', 'video'],
  ['selectedDocuments', 'doc'],
  ['selectedDocs', 'doc'],
  ['selectedCommits', 'commit'],
  ['selectedPullRequests', 'pull-request'],
  ['gitPRDiffSelections', 'pull-request'],
  ['cursorRules', 'rule'],
  ['cursorCommands', 'command'],
  ['terminalSelections', 'terminal'],
  ['externalLinks', 'link'],
  ['subagentSelections', 'subagent'],
  ['browserSelections', 'browser'],
]

/** Cursor's attachment shapes aren't documented and this codebase has
 * never observed most of these channels populated — extract best-effort
 * so an unfamiliar shape degrades to a generic label instead of throwing. */
function normalizeAttachments(context) {
  if (!context || typeof context !== 'object') return []
  const out = []
  for (const [key, kind] of ATTACHMENT_CHANNELS) {
    const list = context[key]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (item == null) continue
      const path =
        typeof item === 'object' ? decodeFileUri(item.uri?.path || item.uri?.external) || item.path || item.url || null : null
      const label =
        (typeof item === 'string' ? item : item.name || item.title || item.commitMessage || item.content || item.text) ||
        (path ? pathBasename(path) : null) ||
        kind
      out.push({ kind, label, path })
    }
  }
  return out
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

  const thinking = raw.thinking?.text ? { text: raw.thinking.text, durationMs: raw.thinkingDurationMs || 0 } : null
  const codeBlocks = (raw.codeBlocks || []).map((b) => ({
    path: b.path ?? b.uri ?? null,
    languageId: b.languageId ?? null,
    content: b.content ?? null,
  }))

  // In practice a bubble carries exactly one of {thinking, text, tool call}
  // — never a mix — but `blocks` renders in true sequence rather than the
  // UI hardcoding an order, so a future bubble shape that *does* combine
  // them (or a codeBlock alongside text) still renders correctly.
  const blocks = []
  if (thinking) blocks.push({ kind: 'thinking', text: thinking.text, durationMs: thinking.durationMs })
  if (raw.text) blocks.push({ kind: 'text', text: raw.text })
  for (const b of codeBlocks) if (b.content) blocks.push({ kind: 'code', ...b })
  for (const t of toolCalls) blocks.push({ kind: 'tool', tool: t })
  if (error) blocks.push({ kind: 'error', error })

  return {
    id: raw.bubbleId,
    sessionId,
    index,
    role: raw.type === 1 ? 'user' : 'assistant',
    createdAt: raw.createdAt || null,
    text: raw.text || '',
    thinking,
    toolCalls,
    codeBlocks,
    blocks,
    attachments: normalizeAttachments(raw.context),
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

/** A queued prompt's shape isn't documented anywhere and this codebase has
 * never observed a non-empty `queueItems` — normalize defensively so an
 * unexpected shape degrades to an empty string rather than throwing. */
function normalizeQueuedPrompt(item, i) {
  if (item == null) return null
  if (typeof item === 'string') return { id: String(i), text: item }
  const text = typeof item.text === 'string' ? item.text : typeof item.richText === 'string' ? item.richText : ''
  return { id: item.id ?? String(i), text }
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
    filesTouched: Object.keys(cd.originalFileStates || {}).map(decodeFileUri),
    // Richer per-file state than `filesTouched` — the content-addressed key
    // for the file's pre-edit snapshot (`ofsContent:…`) and whether Cursor
    // created it fresh. Store.refresh() joins this against each session's
    // edit-kind tool calls to build `fileChanges`.
    originalFileStates: Object.fromEntries(
      Object.entries(cd.originalFileStates || {}).map(([k, v]) => [
        decodeFileUri(k),
        {
          contentKey: v?.contentKey || null,
          isNewlyCreated: !!v?.isNewlyCreated,
          firstEditBubbleId: v?.firstEditBubbleId || null,
        },
      ])
    ),
    messageHeaders,
    messageCount: messageHeaders.length,
    // Live-session signals: a non-empty `generatingBubbleIds` (or, on some
    // backends, `isContinuationInProgress`) is Cursor's own marker that a
    // turn is actively running right now — it exposes this nowhere in the UI.
    generatingBubbleIds: cd.generatingBubbleIds || [],
    isContinuationInProgress: !!cd.isContinuationInProgress,
    hasUnreadMessages: !!cd.hasUnreadMessages,
    queuedPrompts: (cd.queueItems || []).map(normalizeQueuedPrompt).filter(Boolean),
    attachments: normalizeAttachments(cd.context),
    subagentIds: [...(cd.subComposerIds || []), ...(cd.subagentComposerIds || [])],
    trackedGitRepos: (cd.trackedGitRepos || [])
      .map((r) => (typeof r === 'string' ? r : r?.rootPath || r?.path || null))
      .filter(Boolean),
    activeCustomMode: cd.activeCustomMode || null,
    forceMode: cd.forceMode || null,
    addedFiles: cd.addedFiles || 0,
    removedFiles: cd.removedFiles || 0,
    newlyCreatedFolders: (cd.newlyCreatedFolders || []).map(decodeFileUri).filter(Boolean),
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
