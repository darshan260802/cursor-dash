// Auth for `--share`: an 8-character access code gate in front of the
// public tunnel URL, plus the host allow-list that keeps a stray Host
// header (or a DNS-rebinding attempt) from reaching the API.
//
// Deliberately separate from index.js so the request router stays a
// router — everything code/session/rate-limit related lives here. When
// cursor-dash isn't started with --share, none of this is imported or
// constructed, so the plain local path is unaffected.

import crypto from 'node:crypto'

// No 0/O/1/I/L/U — every remaining character is unambiguous read aloud or
// typed from a screenshot.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 8
const TOKEN_TTL_MS = 24 * 60 * 60_000
const MAX_FAILURES = 10
const LOCKOUT_MS = 5 * 60_000
const FAILURE_DELAY_MS = 250
export const ACCESS_COOKIE = 'cursor_dash_access'

export function generateCode() {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
  return out
}

function normalizeCode(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/** Constant-time string compare that doesn't leak length via early return —
 * a length mismatch still does a same-cost dummy comparison before failing. */
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA)
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

function clientKey(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  )
}

function parseCookies(req) {
  const header = req.headers.cookie
  if (!header) return {}
  const out = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

/** Creates the share gate: host allow-list + code verification + session
 * tokens, all in memory. `code` is this process's one access code —
 * generated fresh per `cursor-dash --share` invocation and never written
 * to disk, so it (and every session issued against it) dies with the
 * process, same as the tunnel URL itself. */
export function createShareGate({ code }) {
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
  const tokens = new Map() // token -> expiresAt
  const failures = new Map() // clientKey -> { count, lockedUntil }

  function isLoopbackHost(host) {
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
  }

  /** Register the tunnel's public hostname once known (after the tunnel is
   * up), so requests forwarded through it pass the Host allow-list. */
  function addAllowedHost(host) {
    if (host) allowedHosts.add(host)
  }

  function isAllowedHost(hostHeader) {
    if (!hostHeader) return false
    return allowedHosts.has(hostHeader.split(':')[0])
  }

  /** The machine's own owner, talking to their own loopback address, never
   * needs the code — this is what keeps `--share` a no-op for local use. */
  function isOwnerRequest(req) {
    return isLoopbackHost((req.headers.host || '').split(':')[0])
  }

  function hasValidToken(req) {
    const token = parseCookies(req)[ACCESS_COOKIE]
    if (!token) return false
    const expiresAt = tokens.get(token)
    if (!expiresAt) return false
    if (Date.now() > expiresAt) {
      tokens.delete(token)
      return false
    }
    return true
  }

  function isLockedOut(key) {
    const entry = failures.get(key)
    return !!entry && entry.lockedUntil > Date.now()
  }

  function recordFailure(key) {
    const entry = failures.get(key) || { count: 0, lockedUntil: 0 }
    entry.count += 1
    if (entry.count >= MAX_FAILURES) {
      entry.lockedUntil = Date.now() + LOCKOUT_MS
      entry.count = 0
    }
    failures.set(key, entry)
  }

  /** Checks a submitted code, issuing an access-token cookie value on
   * success. Every attempt — right or wrong — pays a fixed delay, and
   * repeated failures from the same client lock it out for a few minutes,
   * so the ~6.6×10^11-combination code can't be brute-forced by anyone who
   * finds the tunnel URL. */
  async function verify(req, submittedCode) {
    const key = clientKey(req)
    if (isLockedOut(key)) return { ok: false, reason: 'locked' }

    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS))

    if (!timingSafeEqualStr(normalizeCode(submittedCode), code)) {
      recordFailure(key)
      console.log(`[cursor-dash] share: rejected access code from ${key}`)
      return { ok: false, reason: 'invalid' }
    }

    failures.delete(key)
    const token = crypto.randomBytes(32).toString('base64url')
    tokens.set(token, Date.now() + TOKEN_TTL_MS)
    console.log(`[cursor-dash] share: granted access to ${key}`)
    return { ok: true, token }
  }

  function isAuthorized(req) {
    return isOwnerRequest(req) || hasValidToken(req)
  }

  function tokenCookie(token, { secure }) {
    const parts = [
      `${ACCESS_COOKIE}=${token}`,
      'HttpOnly',
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}`,
    ]
    if (secure) parts.push('Secure')
    return parts.join('; ')
  }

  return { addAllowedHost, isAllowedHost, isOwnerRequest, isAuthorized, verify, tokenCookie }
}

/** Self-contained gate page — no dependency on `dist/` having been built,
 * and no client-side framework, so it works even if the SPA bundle isn't
 * present. Posts the code to /api/access and reloads on success. */
export function renderGatePage({ error = false } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>cursor-dash — enter access code</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    background: #14121a; color: #f2f0f6;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    padding: 24px;
  }
  .card {
    width: 100%; max-width: 360px; background: #1e1b26; border: 1px solid #322d3d;
    border-radius: 16px; padding: 28px; box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  }
  h1 { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
  p { color: #a49cb5; font-size: 13px; margin: 0 0 20px; }
  input {
    width: 100%; font: 20px/1.2 "JetBrains Mono", ui-monospace, monospace; letter-spacing: 0.2em;
    text-align: center; text-transform: uppercase; padding: 12px; border-radius: 10px;
    border: 1px solid #3a3448; background: #14121a; color: #f2f0f6; outline: none;
  }
  input:focus { border-color: #f2a65a; }
  button {
    width: 100%; margin-top: 12px; padding: 11px; border-radius: 10px; border: none;
    background: #f2a65a; color: #1a1420; font-weight: 600; font-size: 14px; cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: default; }
  .msg { min-height: 18px; margin-top: 10px; font-size: 12.5px; color: #f2668b; }
</style>
</head>
<body>
  <form class="card" id="gate" autocomplete="off">
    <h1>cursor-dash</h1>
    <p>Enter the 8-character access code shown in the terminal that started this dashboard.</p>
    <input id="code" name="code" maxlength="8" inputmode="text" autocapitalize="characters"
           autocomplete="off" spellcheck="false" placeholder="XXXXXXXX" autofocus>
    <button type="submit">Continue</button>
    <div class="msg" id="msg">${error ? 'Incorrect code. Try again.' : ''}</div>
  </form>
  <script>
    const form = document.getElementById('gate');
    const input = document.getElementById('code');
    const msg = document.getElementById('msg');
    const btn = form.querySelector('button');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      msg.textContent = '';
      try {
        const res = await fetch('/api/access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: input.value }),
        });
        if (res.ok) {
          location.reload();
          return;
        }
        const body = await res.json().catch(() => ({}));
        msg.textContent = body.reason === 'locked'
          ? 'Too many wrong attempts. Try again in a few minutes.'
          : 'Incorrect code. Try again.';
      } catch {
        msg.textContent = 'Could not reach the server. Try again.';
      }
      btn.disabled = false;
      input.select();
    });
  </script>
</body>
</html>`
}
