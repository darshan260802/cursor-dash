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
