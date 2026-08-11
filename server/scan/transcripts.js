// Raw agent-transcript JSONL files, written for sessions running the newer
// `cursor-agent` backend. These are a *supplement* to the DB bubbles, not a
// replacement: assistant text here is sometimes `[REDACTED]` under privacy
// mode, but the file uniquely carries the final `turn_ended` status/error
// and un-truncated tool inputs.

import fs from 'node:fs'
import path from 'node:path'

/** @returns {Map<string, string>} composerId -> absolute .jsonl path */
export function indexTranscripts(projectsDir) {
  const index = new Map()
  let projectDirs = []
  try {
    projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
  } catch {
    return index
  }

  for (const proj of projectDirs) {
    if (!proj.isDirectory()) continue
    const transcriptsDir = path.join(projectsDir, proj.name, 'agent-transcripts')
    let sessionDirs = []
    try {
      sessionDirs = fs.readdirSync(transcriptsDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const s of sessionDirs) {
      if (!s.isDirectory()) continue
      const file = path.join(transcriptsDir, s.name, `${s.name}.jsonl`)
      if (fs.existsSync(file)) index.set(s.name, file)
    }
  }
  return index
}

export function readTranscript(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      out.push(JSON.parse(trimmed))
    } catch {
      /* skip a malformed line rather than fail the whole transcript */
    }
  }
  return out
}

/** The terminal `turn_ended` entry, if the transcript has one. */
export function transcriptOutcome(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]?.type === 'turn_ended') {
      return { status: entries[i].status ?? null, error: entries[i].error ?? null }
    }
  }
  return { status: null, error: null }
}

// The transcript is written by whichever agent backend ran the turn, which
// doesn't always share Cursor's own internal tool identifiers (a
// Claude-Code-style backend logs `Read`/`Edit`/`Bash`/…, not
// `read_file_v2`/`edit_file_v2`/`run_terminal_command_v2`). This alias
// table only covers names actually observed in the wild; an unmapped name
// simply never matches, which is the safe failure mode.
const TOOL_NAME_ALIASES = {
  Read: 'read_file_v2',
  Write: 'edit_file_v2',
  Edit: 'edit_file_v2',
  MultiEdit: 'edit_file_v2',
  Bash: 'run_terminal_command_v2',
  Glob: 'glob_file_search',
  Grep: 'ripgrep_raw_search',
  TodoWrite: 'todo_write',
}

/** Builds, per Cursor tool name, an ordered queue of the `input` objects
 * the transcript recorded for that tool — used to backfill a tool call
 * whose DB-stored args came back empty (Cursor truncates some argument
 * payloads; the transcript copy is not subject to the same limit). Queues
 * are consumed positionally per name, which holds as long as calls of the
 * same tool happen in the same relative order in both records — true by
 * construction, since both are logs of the same execution. */
export function buildToolInputQueues(entries) {
  const queues = new Map()
  for (const entry of entries) {
    if (entry?.role !== 'assistant') continue
    for (const block of entry.message?.content || []) {
      if (block?.type !== 'tool_use' || !block.name) continue
      const cursorName = TOOL_NAME_ALIASES[block.name] || block.name
      if (!queues.has(cursorName)) queues.set(cursorName, [])
      queues.get(cursorName).push(block.input ?? null)
    }
  }
  return queues
}
