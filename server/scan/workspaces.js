// Per-workspace state: the folder a session ran in, plus legacy
// aiService.generations/prompts activity that predates (or sits outside)
// the composer system entirely.

import fs from 'node:fs'
import path from 'node:path'
import { openDb } from '../sqlite.js'

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function folderPathFromUri(uri) {
  if (!uri) return null
  if (uri.startsWith('file://')) {
    try {
      return decodeURIComponent(uri.replace(/^file:\/\//, ''))
    } catch {
      return uri.replace(/^file:\/\//, '')
    }
  }
  return uri
}

export async function scanWorkspaces(sources) {
  let entries = []
  try {
    entries = fs.readdirSync(sources.workspaceStorageDir, { withFileTypes: true })
  } catch {
    return []
  }

  const results = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const wsDir = path.join(sources.workspaceStorageDir, entry.name)

    let folderPath = null
    try {
      const wsJson = JSON.parse(fs.readFileSync(path.join(wsDir, 'workspace.json'), 'utf8'))
      folderPath = folderPathFromUri(wsJson.folder)
    } catch {
      /* empty-window profiles have no workspace.json */
    }

    let generations = []
    let prompts = []
    const db = await openDb(path.join(wsDir, 'state.vscdb'))
    if (db) {
      const g = db.get(`SELECT value FROM ItemTable WHERE key = 'aiService.generations'`)
      const p = db.get(`SELECT value FROM ItemTable WHERE key = 'aiService.prompts'`)
      generations = g ? safeJsonParse(g.value, []) : []
      prompts = p ? safeJsonParse(p.value, []) : []
      db.close()
    }

    results.push({ workspaceId: entry.name, folderPath, generations, prompts })
  }
  return results
}

/** @returns {Map<string, string|null>} workspaceId -> folder path */
export function workspaceIndexFromScan(workspaces) {
  const idx = new Map()
  for (const w of workspaces) idx.set(w.workspaceId, w.folderPath)
  return idx
}
