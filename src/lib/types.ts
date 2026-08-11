// Mirrors the normalized shapes produced by server/normalize.js + metrics.js.
// Kept hand-written (not codegen'd) since the server is the single source
// of truth and the shape surface is small and stable.

export type TokenSource = "measured" | "reported" | "estimated"
export type CostSource = "measured" | "reported" | "estimated" | "partial" | "unpriced"

export interface TokenTotals {
  input: number
  output: number
  total: number
  measured: number
  estimated: number
}

export interface ModelCostEntry {
  model: string
  inputTokens: number
  outputTokens: number
  usd: number
  priced: boolean
}

export interface CostTotals {
  usd: number
  unpricedTokens: number
  source: CostSource
  byModel: ModelCostEntry[]
}

export interface ContextCategory {
  id: string
  label: string
  estimatedTokens: number
}

export interface Todo {
  id: string
  content: string
  status: string
}

export interface MessageHeader {
  bubbleId: string
  role: "user" | "assistant"
  index: number
  createdAt: string | null
  textPreview: string | null
  hasThinking: boolean
  thinkingDurationMs: number
  capabilityType: number | null
}

export type ToolKind = "edit" | "terminal" | "read" | "search" | "todo" | "web" | "generic"

export interface DiffHunk {
  type: "added" | "removed" | "unchanged" | string
  content: string
  oldLine: number | null
  newLine: number | null
}

export interface EditToolDetail {
  path: string | null
  hunks: DiffHunk[]
  added: number | null
  removed: number | null
  beforeContentId: string | null
  afterContentId: string | null
  appliedDiffId?: string
  appliedGenerationId?: string
}

export interface TerminalToolDetail {
  command: string | null
  cwd: string | null
  output: string | null
  rejected: boolean
  startedAtMs: number | null
}

export interface ReadToolDetail {
  path: string | null
  offset: number | null
  limit: number | null
  totalLinesInFile: number | null
}

export interface SearchToolDetail {
  pattern: string | null
  targetDirectory: string | null
  matchCount: number
  matches: string[]
}

export interface TodoToolDetail {
  todos: Todo[]
}

export type ToolDetail = EditToolDetail | TerminalToolDetail | ReadToolDetail | SearchToolDetail | TodoToolDetail | null

export interface ToolCall {
  id: string | null
  name: string
  kind: ToolKind
  status: string
  startedAtMs: number | null
  durationMs: number | null
  args: unknown
  result: unknown
  detail: ToolDetail
}

export interface CodeBlock {
  path: string | null
  languageId: string | null
  content: string | null
}

export interface MessageError {
  requestId?: string
  error?: unknown
  [key: string]: unknown
}

export interface Attachment {
  kind: string
  label: string
  path: string | null
}

export type MessageBlock =
  | { kind: "thinking"; text: string; durationMs: number }
  | { kind: "text"; text: string }
  | ({ kind: "code" } & CodeBlock)
  | { kind: "tool"; tool: ToolCall }
  | { kind: "error"; error: MessageError }

export interface Message {
  id: string
  sessionId: string
  index: number
  role: "user" | "assistant"
  createdAt: string | null
  text: string
  thinking: { text: string; durationMs: number } | null
  toolCalls: ToolCall[]
  codeBlocks: CodeBlock[]
  blocks: MessageBlock[]
  attachments: Attachment[]
  model: string | null
  modelSource?: "reported" | "inferred" | null
  tokens: { input: number; output: number; source: TokenSource }
  error: MessageError | null
  capabilityType: number | null
  isAgentic: boolean
}

export interface SessionSummary {
  id: string
  workspaceId: string | null
  workspacePath: string | null
  workspaceName: string | null
  name: string | null
  subtitle: string | null
  mode: "agent" | "chat"
  backend: string | null
  status: string | null
  createdAt: number | null
  lastUpdatedAt: number | null
  recency: number
  isArchived: boolean
  isSubagent: boolean
  isDraft: boolean
  isWorktree: boolean
  isSpec: boolean
  numSubComposers: number
  linesAdded: number
  linesRemoved: number
  filesChangedCount: number
  contextUsagePercent: number | null
  model: string | null
}

export interface QueuedPrompt {
  id: string
  text: string
}

export interface FileChange {
  path: string
  isNewlyCreated: boolean
  editCount: number
  added: number
  removed: number
  beforeContentId: string | null
  afterContentId: string | null
  ofsContentKey: string | null
}

export interface SessionDetail extends SessionSummary {
  contextTokensUsed: number | null
  contextTokenLimit: number | null
  tokenBreakdown: ContextCategory[]
  modelConfig: { modelName?: string } | null
  todos: Todo[]
  newlyCreatedFiles: string[]
  filesTouched: string[]
  messageHeaders: MessageHeader[]
  messageCount: number
  toolCallCount: number
  toolCallErrorCount: number
  errorCount: number
  durationMs: number | null
  tokens: TokenTotals
  cost: CostTotals
  toolNames: string[]
  fileExtensions: string[]
  generatingBubbleIds: string[]
  isContinuationInProgress: boolean
  hasUnreadMessages: boolean
  queuedPrompts: QueuedPrompt[]
  attachments: Attachment[]
  subagentIds: string[]
  trackedGitRepos: string[]
  activeCustomMode: string | null
  forceMode: string | null
  addedFiles: number
  removedFiles: number
  newlyCreatedFolders: string[]
  fileChanges: FileChange[]
}

export interface LiveState {
  sessionId: string | null
  isGenerating: boolean
  startedAt: number | null
  generatingBubbleIds: string[]
  queuedPrompts: QueuedPrompt[]
  lastEventAt: number | null
}

export interface Paginated<T> {
  items: T[]
  total: number
  offset: number
  limit: number
}

export interface Overview {
  sessionCount: number
  activeSessionCount: number
  messageCount: number
  toolCallCount: number
  toolCallErrorCount: number
  errorCount: number
  linesAdded: number
  linesRemoved: number
  filesChangedCount: number
  tokens: TokenTotals
  costUsd: number
  unpricedTokens: number
  workspaceCount: number
  activeDayCount: number
}

export interface TimelineBucket {
  date: string
  sessions: number
  messages: number
  tokens: number
  costUsd: number
  linesAdded: number
  linesRemoved: number
}

export interface ModelBreakdownEntry {
  model: string
  sessions: number
  inputTokens: number
  outputTokens: number
  usd: number
  priced: boolean
}

export interface ToolBreakdownEntry {
  name: string
  count: number
  errorCount: number
}

export interface ContextPressureEntry {
  id: string
  name: string
  contextUsagePercent: number | null
  contextTokensUsed: number | null
  contextTokenLimit: number | null
  categories: ContextCategory[]
}

export interface WorkspaceActivity {
  workspaceId: string
  folderPath: string | null
  folderName: string | null
  legacyGenerations: { id: string; at: number; type: string; description: string | null }[]
  legacyPromptCount: number
  sessionCount: number
  tokens: number
  costUsd: number
}

export interface SourceHealth {
  profile: string
  source: string
  ok: boolean
  path: string
}

export interface Meta {
  platform: string
  profiles: { id: string; label: string; userDir: string }[]
  sourceHealth: SourceHealth[]
  sessionCount: number
  lastRefreshedAt: number | null
}

export interface ScoredCommit {
  commitHash: string
  branchName: string
  scoredAt: number
  linesAdded: number
  linesDeleted: number
  composerLinesAdded: number
  composerLinesDeleted: number
  tabLinesAdded: number
  tabLinesDeleted: number
  humanLinesAdded: number
  humanLinesDeleted: number
  commitMessage: string
  commitDate: string
  v1AiPercentage: string
  v2AiPercentage: string
}

export interface AiTrackingRollupEntry {
  key: string
  count: number
  fileExtensions: string[]
  models: string[]
}

export interface AiTracking {
  hashesByDay: { day: string; source: string; fileExtension: string | null; model: string | null; count: number }[]
  commits: ScoredCommit[]
  summaries: {
    conversationId: string
    title: string
    tldr: string
    overview: string | null
    summaryBullets: string | null
    model: string
    mode: string
    updatedAt: number
  }[]
  fileExtensionBreakdown: { extension: string; count: number }[]
  byConversation: AiTrackingRollupEntry[]
  byFile: AiTrackingRollupEntry[]
}

export interface PricingModelEntry {
  input: number | null
  output: number | null
  note?: string
}

export interface Pricing {
  currency: string
  note: string
  models: Record<string, PricingModelEntry>
}

export interface SessionQuery {
  q?: string
  from?: number
  to?: number
  workspace?: string
  model?: string
  mode?: string
  status?: string
  hasErrors?: boolean
  hasToolCalls?: boolean
  minTokens?: number
  maxTokens?: number
  minLines?: number
  maxLines?: number
  tool?: string
  fileExtension?: string
  includeArchived?: boolean
  includeSubagent?: boolean
  includeDraft?: boolean
  sort?: "recency" | "createdAt" | "tokens" | "cost" | "messages" | "lines" | "duration"
  order?: "asc" | "desc"
  offset?: number
  limit?: number
}
