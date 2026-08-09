// Optional, off-by-default: reads the local Cursor auth JWT and attempts
// to fetch real account usage from cursor.com so the dashboard can show
// actual spend/quota next to the offline token estimate.
//
// This talks to an unofficial, undocumented endpoint the Cursor editor
// itself uses internally — it is not a published API, and it can change
// or fail without notice. Every caller must treat a non-ok response as a
// normal outcome ("Live usage unavailable"), never as an error to surface
// loudly. The token is read from Cursor's own local database, used for a
// single outbound request, and never logged or written to disk.

import { openDb } from './sqlite.js'
import { profileSources } from './paths.js'

async function readAccessToken(profile) {
  const sources = profileSources(profile)
  const db = await openDb(sources.globalStateDb)
  if (!db) return null
  const row = db.get(`SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'`)
  db.close()
  return row?.value || null
}

export async function fetchCloudUsage(profile) {
  const token = await readAccessToken(profile)
  if (!token) return { ok: false, reason: 'no-local-token' }

  try {
    const res = await fetch('https://api2.cursor.sh/aiserver.v1.DashboardService/GetUsageBasedPremiumRequests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { ok: false, reason: `http-${res.status}` }
    const data = await res.json()
    return { ok: true, data, fetchedAt: Date.now() }
  } catch (err) {
    return { ok: false, reason: 'network-error', message: String(err?.message || err) }
  }
}
