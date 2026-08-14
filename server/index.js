// The HTTP app: a small hand-rolled router (no framework — keeps `npx
// cursor-dash` cold-starts fast and the dependency surface tiny) exposing
// the read-only API, an SSE live-update stream, and — once built — the
// Vite app's static `dist/` output with SPA fallback.

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { fetchCloudUsage } from './cloud.js'
import { renderGatePage } from './share.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    // The whole point of this app is showing current data — never let a
    // browser or intermediary cache an /api response.
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType })
  res.end(text)
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** DNS-rebinding guard for the non-`--share` path: only accept requests
 * addressed to loopback. `--share` widens this to also allow the tunnel's
 * own hostname — see share.js's `isAllowedHost`. */
function isLoopbackHost(hostHeader) {
  if (!hostHeader) return false
  const host = hostHeader.split(':')[0]
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

// How long a GET /api/changes request is held open waiting for something to
// report before answering "nothing yet". Comfortably under Cloudflare's
// Quick Tunnel idle timeout (~100s) and short enough that a client stuck
// behind a proxy that kills long-idle connections reconnects promptly.
const LONG_POLL_TIMEOUT_MS = 25_000

/**
 * The HTTP app. `share`, when passed, is the gate created by
 * `share.js#createShareGate` for `--share` mode: it widens the host
 * allow-list to the tunnel's hostname and requires either a loopback
 * request (the owner) or a valid access-code session before anything past
 * the gate page is served. When `share` is null (the default), behavior is
 * unchanged from before — loopback-only, no gate.
 */
export function createServer(store, { cloudEnabled = false, share = null } = {}) {
  const server = http.createServer(async (req, res) => {
    const allowedHost = share ? share.isAllowedHost(req.headers.host) : isLoopbackHost(req.headers.host)
    if (!allowedHost) {
      sendText(res, 403, 'Forbidden: cursor-dash only accepts requests addressed to a known host.')
      return
    }

    const url = new URL(req.url, 'http://localhost')
    const query = Object.fromEntries(url.searchParams)
    const parts = url.pathname.split('/').filter(Boolean)

    try {
      if (share && parts[0] === 'api' && parts[1] === 'access' && req.method === 'POST') {
        await handleAccess(req, res, share)
        return
      }

      if (share && !share.isAuthorized(req)) {
        if (parts[0] === 'api') {
          sendJson(res, 401, { error: 'access_required' })
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(renderGatePage())
        return
      }

      if (parts[0] === 'api' && parts[1] === 'changes' && req.method === 'GET') {
        await handleChanges(req, res, store, query)
        return
      }

      if (parts[0] === 'api') {
        await handleApi(req, res, { store, cloudEnabled, parts, query })
        return
      }

      await serveStatic(req, res, url.pathname)
    } catch (err) {
      console.error('[cursor-dash] request error:', err)
      sendJson(res, 500, { error: 'internal_error', message: err.message })
    }
  })

  return server
}

async function handleAccess(req, res, share) {
  // Unlike the rest of the API, this endpoint is reachable by an anonymous
  // stranger with nothing but the tunnel URL, before they've proven
  // anything — malformed input here shouldn't surface a 500.
  let body
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'invalid_body' })
    return
  }
  const result = await share.verify(req, body.code)
  if (!result.ok) {
    sendJson(res, 401, { error: 'invalid_code', reason: result.reason })
    return
  }
  // Only mark the cookie Secure when we know the client reached us over
  // HTTPS (the tunnel terminates TLS and forwards this header) — a bare
  // `Secure` would make the cookie silently unusable for the owner's own
  // plain-HTTP http://127.0.0.1 access.
  const secure = req.headers['x-forwarded-proto'] === 'https'
  res.setHeader('Set-Cookie', share.tokenCookie(result.token, { secure }))
  sendJson(res, 200, { ok: true })
}

/** Long-poll change feed: answers immediately if `store.version` has moved
 * past `since`, otherwise holds the request until something changes or
 * `LONG_POLL_TIMEOUT_MS` elapses. Replaces the old SSE `/api/events`
 * stream — plain request/response survives being proxied through a
 * Cloudflare Quick Tunnel (which buffers SSE-over-GET until the
 * connection closes, making it useless for this) and every other
 * buffering intermediary, at the cost of one held connection per client
 * instead of a push. */
async function handleChanges(req, res, store, query) {
  const since = Number(query.since)
  const sinceVersion = Number.isFinite(since) && since >= 0 ? since : 0

  const immediate = store.getChangesSince(sinceVersion)
  if (immediate) {
    sendJson(res, 200, immediate)
    return
  }

  await new Promise((resolve) => {
    let settled = false
    let stopListening = () => {}
    const timer = setTimeout(finish, LONG_POLL_TIMEOUT_MS)

    function finish() {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stopListening()
      req.removeListener('close', onClose)
      const payload = store.getChangesSince(sinceVersion) || {
        version: store.version,
        scopes: [],
        changedSessionIds: [],
      }
      try {
        sendJson(res, 200, payload)
      } catch {
        /* client disconnected between the change firing and us writing */
      }
      resolve()
    }

    function onClose() {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stopListening()
      resolve()
    }

    stopListening = store.onChange(finish)
    req.on('close', onClose)
  })
}

async function handleApi(req, res, { store, cloudEnabled, parts, query }) {
  // parts[0] === 'api'
  const [, resource, id, sub] = parts

  if (resource === 'meta' && req.method === 'GET') {
    return sendJson(res, 200, store.getMeta())
  }

  if (resource === 'refresh' && req.method === 'POST') {
    await store.forceRefresh()
    return sendJson(res, 200, store.getMeta())
  }

  if (resource === 'overview' && req.method === 'GET') {
    return sendJson(res, 200, store.getOverview())
  }

  if (resource === 'live' && req.method === 'GET') {
    return sendJson(res, 200, store.getLiveState())
  }

  if (resource === 'sessions' && req.method === 'GET' && !id) {
    return sendJson(res, 200, store.listSessions(query))
  }

  if (resource === 'sessions' && req.method === 'GET' && id && !sub) {
    const session = store.getSession(id)
    if (!session) return sendJson(res, 404, { error: 'not_found' })
    return sendJson(res, 200, session)
  }

  if (resource === 'sessions' && req.method === 'GET' && id && sub === 'messages') {
    const session = store.getSession(id)
    if (!session) return sendJson(res, 404, { error: 'not_found' })
    return sendJson(res, 200, store.getMessages(id, query))
  }

  if (resource === 'sessions' && req.method === 'GET' && id && sub === 'transcript-outcome') {
    return sendJson(res, 200, store.getTranscriptOutcome(id) || { status: null, error: null })
  }

  if (resource === 'sessions' && req.method === 'GET' && id && sub === 'files') {
    return sendJson(res, 200, store.getFileChanges(id))
  }

  if (resource === 'sessions' && req.method === 'GET' && id && sub === 'content') {
    const key = query.key
    if (!key) return sendJson(res, 400, { error: 'missing_key' })
    const value = await store.getContent(id, key)
    if (value == null) return sendJson(res, 404, { error: 'not_found' })
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    return res.end(value)
  }

  if (resource === 'sessions' && req.method === 'GET' && id && sub === 'export') {
    const session = store.getSession(id)
    if (!session) return sendJson(res, 404, { error: 'not_found' })
    const messages = store.getMessages(id, { limit: 100000 }).items
    const format = query.format || 'json'
    if (format === 'md') {
      const md = renderMarkdown(session, messages)
      res.writeHead(200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${id}.md"`,
      })
      return res.end(md)
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${id}.json"`,
    })
    return res.end(JSON.stringify({ session, messages }, null, 2))
  }

  if (resource === 'analytics' && req.method === 'GET') {
    if (id === 'timeline') return sendJson(res, 200, store.getTimeline(query.unit))
    if (id === 'models') return sendJson(res, 200, store.getModelBreakdown())
    if (id === 'tools') return sendJson(res, 200, store.getToolBreakdown())
    if (id === 'context') return sendJson(res, 200, store.getContextPressure())
    return sendJson(res, 404, { error: 'not_found' })
  }

  if (resource === 'code-tracking' && req.method === 'GET') {
    return sendJson(res, 200, store.getAiTracking())
  }

  if (resource === 'workspaces' && req.method === 'GET') {
    return sendJson(res, 200, store.getWorkspaces())
  }

  if (resource === 'search' && req.method === 'GET') {
    return sendJson(res, 200, await store.search(query.q))
  }

  if (resource === 'pricing' && req.method === 'GET') {
    return sendJson(res, 200, store.pricing)
  }

  if (resource === 'pricing' && req.method === 'PUT') {
    const body = await readJsonBody(req)
    await store.setPricingOverride(body.models || {})
    return sendJson(res, 200, store.pricing)
  }

  if (resource === 'pricing' && id === 'refresh' && req.method === 'POST') {
    const result = await store.refreshPricingFromDocs()
    return sendJson(res, result.ok ? 200 : 502, result)
  }

  if (resource === 'cloud' && id === 'sync' && req.method === 'POST') {
    if (!cloudEnabled) return sendJson(res, 403, { ok: false, reason: 'cloud-sync-disabled' })
    const profile = store.profiles[0]
    if (!profile) return sendJson(res, 200, { ok: false, reason: 'no-profile' })
    const result = await fetchCloudUsage(profile)
    return sendJson(res, 200, result)
  }

  sendJson(res, 404, { error: 'not_found' })
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendText(res, 405, 'Method Not Allowed')
  }

  if (!fs.existsSync(distDir)) {
    return sendText(
      res,
      503,
      'cursor-dash: the frontend has not been built yet. Run `npm run build` (or `npm run dev` for local development).'
    )
  }

  let filePath = path.join(distDir, decodeURIComponent(pathname))
  // Prevent path traversal outside dist/.
  if (!filePath.startsWith(distDir)) filePath = distDir

  let stat
  try {
    stat = fs.statSync(filePath)
  } catch {
    stat = null
  }

  if (!stat || stat.isDirectory()) {
    filePath = path.join(distDir, 'index.html')
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback for client-side routes.
      const indexPath = path.join(distDir, 'index.html')
      fs.readFile(indexPath, (err2, indexData) => {
        if (err2) return sendText(res, 404, 'Not found')
        res.writeHead(200, { 'Content-Type': MIME['.html'] })
        res.end(indexData)
      })
      return
    }
    const ext = path.extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(data)
  })
}

function renderMarkdown(session, messages) {
  const lines = [`# ${session.name || session.id}`, '']
  lines.push(`- Workspace: ${session.workspacePath || session.workspaceName || 'unknown'}`)
  lines.push(`- Model: ${session.model || 'unknown'}`)
  lines.push(`- Created: ${session.createdAt ? new Date(session.createdAt).toISOString() : 'unknown'}`)
  lines.push(`- Messages: ${session.messageCount}`)
  lines.push('')
  for (const m of messages) {
    lines.push(`## ${m.role} — ${m.createdAt ? new Date(m.createdAt).toISOString() : ''}`)
    if (m.thinking) lines.push(`> _thinking (${m.thinking.durationMs}ms)_: ${m.thinking.text}`, '')
    if (m.text) lines.push(m.text, '')
    for (const t of m.toolCalls) {
      lines.push(`\`\`\`tool:${t.name} (${t.status})`)
      lines.push(JSON.stringify(t.args, null, 2))
      lines.push('```', '')
    }
  }
  return lines.join('\n')
}
