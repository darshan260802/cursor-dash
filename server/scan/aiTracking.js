// AI code-authorship tracking: which lines in your repos came from Cursor
// vs. from you, tracked per commit and per generated file hash.

import { openDb } from '../sqlite.js'

export async function scanAiTracking(sources) {
  const db = await openDb(sources.aiTrackingDb)
  if (!db) return null

  const hashesByDay = db.all(
    `SELECT date(createdAt / 1000, 'unixepoch') as day, source, fileExtension, model, COUNT(*) as count
     FROM ai_code_hashes
     GROUP BY day, source, fileExtension, model
     ORDER BY day DESC
     LIMIT 5000`
  )

  const commits = db.all(
    `SELECT commitHash, branchName, scoredAt, linesAdded, linesDeleted,
            composerLinesAdded, composerLinesDeleted, tabLinesAdded, tabLinesDeleted,
            humanLinesAdded, humanLinesDeleted, commitMessage, commitDate,
            v1AiPercentage, v2AiPercentage
     FROM scored_commits
     ORDER BY scoredAt DESC
     LIMIT 1000`
  )

  const summaries = db.all(
    `SELECT conversationId, title, tldr, model, mode, updatedAt
     FROM conversation_summaries
     ORDER BY updatedAt DESC
     LIMIT 1000`
  )

  db.close()
  return { hashesByDay, commits, summaries }
}
