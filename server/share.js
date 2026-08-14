// Auth for sharing: an 8-character access code gate in front of the public
// tunnel URL, plus the host allow-list that keeps a stray Host header (or a
// DNS-rebinding attempt) from reaching the API. The gate itself is always
// constructed (see shareController.js) but starts with no code, in which
// case `isAuthorized` passes everything through — so the plain local path
// (no share ever started) is unaffected in practice, it just goes through
// the same code path instead of being skipped entirely.
//
// Deliberately separate from index.js so the request router stays a
// router — everything code/session/rate-limit related lives here.

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

/** "H6S8SGA7" -> "H6S8-SGA7" — purely a display convenience (the CLI
 * banner, the gate page's boxes); `normalizeCode` strips the hyphen right
 * back out, so a code copied with or without it always verifies. */
export function formatCodeForDisplay(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`
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
 * tokens, all in memory. Starts with no code (inactive) unless one is
 * passed — the gate can be activated and deactivated later via `setCode` /
 * `clearCode`, which is what lets sharing be started and stopped at
 * runtime from the dashboard rather than only at process launch. A code is
 * never written to disk, so it (and every session issued against it) dies
 * with the process at the latest, same as the tunnel URL itself. */
export function createShareGate({ code = null } = {}) {
  let currentCode = code
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
  const tokens = new Map() // token -> expiresAt
  const failures = new Map() // clientKey -> { count, lockedUntil }

  function isLoopbackHost(host) {
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
  }

  function isActive() {
    return currentCode != null
  }

  function setCode(newCode) {
    currentCode = newCode
  }

  /** Deactivates the gate: clears the code (so `verify` fails closed),
   * drops every issued session token, and restores the host allow-list to
   * loopback-only. Leaves the local dashboard itself untouched — this is
   * exactly the "stop sharing" operation, not a server shutdown. */
  function clearCode() {
    currentCode = null
    tokens.clear()
    allowedHosts.clear()
    allowedHosts.add('localhost')
    allowedHosts.add('127.0.0.1')
    allowedHosts.add('::1')
    allowedHosts.add('[::1]')
  }

  function revokeAllTokens() {
    tokens.clear()
  }

  /** Register the tunnel's public hostname once known (after the tunnel is
   * up), so requests forwarded through it pass the Host allow-list. */
  function addAllowedHost(host) {
    if (host) allowedHosts.add(host)
  }

  /** The counterpart to addAllowedHost — used when a stopped tunnel's
   * hostname should no longer be treated as this dashboard's own. */
  function removeAllowedHost(host) {
    if (host) allowedHosts.delete(host)
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
    if (!currentCode) return { ok: false, reason: 'invalid' }
    if (isLockedOut(key)) return { ok: false, reason: 'locked' }

    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS))

    if (!timingSafeEqualStr(normalizeCode(submittedCode), currentCode)) {
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

  /** When the gate is inactive (no share running), every request is
   * authorized — this is what lets a single always-present gate object
   * serve both the plain local mode and an active `--share` session
   * without the router needing to branch on which mode it's in. */
  function isAuthorized(req) {
    if (!isActive()) return true
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

  return {
    addAllowedHost,
    removeAllowedHost,
    isAllowedHost,
    isOwnerRequest,
    isAuthorized,
    verify,
    tokenCookie,
    isActive,
    setCode,
    clearCode,
    revokeAllTokens,
  }
}

// The actual app logo (public/logo.png — the same file Sidebar.tsx, the
// About modal, and the splash screen all use), referenced by URL rather
// than inlined: it's a 421KB raster, too heavy to base64 into every
// gate-page response. index.js carries a narrow, explicit bypass so this
// one path is served even to an unauthenticated request — it's the app's
// static branding image, not session data, so there's nothing to protect
// by gating it, and gating it by accident would just show a broken image.
// (favicon.svg, despite the name, is unused Vite template scaffolding —
// not the real brand mark — so it's deliberately not used here.)

/** Self-contained gate page — no dependency on `dist/` having been built,
 * and no client-side framework, so it works even if the SPA bundle isn't
 * present. Posts the code to /api/access and reloads on success.
 *
 * Visually this mirrors the main app's actual design tokens (the same
 * oklch values, radius scale, and type stack as `src/index.css`'s `.dark`
 * block — the app defaults to dark regardless of OS preference, so this
 * does too) rather than an unrelated hand-picked palette. The access-code
 * field imitates shadcn/ui's `input-otp` component — 8 boxed slots in two
 * groups of 4 — using the same technique that component itself uses under
 * the hood: one real `<input>` (for typing, paste, and mobile keyboards)
 * rendered invisibly on top of styled slot `<div>`s that mirror its value.
 * It can't be the actual React component without pulling a build step into
 * this otherwise-static page, so this reproduces its behavior directly. */
export function renderGatePage({ error = false } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Cursor Dash — Enter access code</title>
<style>
  :root {
    color-scheme: dark;
    --background: oklch(0.1091 0.0091 301.6956);
    --foreground: oklch(0.9838 0.0035 247.8583);
    --card: oklch(0.1376 0.0118 301.0607);
    --border: oklch(0.2505 0.0293 299.5707);
    --input: oklch(0.2505 0.0293 299.5707);
    --muted-foreground: oklch(0.7497 0.0224 301.0128);
    --amber: #F2A65A;
    --coral: #F2668B;
    --primary-foreground: oklch(0.1091 0.0091 301.6956);
    --radius: 1rem;
    --font-sans: "Plus Jakarta Sans", Inter, system-ui, sans-serif;
    --font-heading: "Bricolage Grotesque Variable", var(--font-sans);
    --font-mono: "JetBrains Mono", ui-monospace, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    background: var(--background); color: var(--foreground);
    font: 15px/1.5 var(--font-sans); letter-spacing: -0.01em;
    padding: 24px;
  }
  .card {
    width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 1.5); padding: 32px 28px;
    box-shadow: 0 20px 40px -10px rgb(0 0 0 / 0.5);
  }
  .brand { display: flex; align-items: center; gap: 10px; margin: 0 0 6px; }
  .brand img { width: 34px; height: 34px; flex-shrink: 0; border-radius: calc(var(--radius) * 0.5); object-fit: cover; }
  .brand span {
    font-family: var(--font-heading); font-size: 21px; font-weight: 700;
    letter-spacing: -0.02em; color: var(--foreground);
  }
  p.desc { color: var(--muted-foreground); font-size: 13px; margin: 0 0 22px; }

  /* OTP field: a real input, sized to cover the slot row exactly, with its
     own text made invisible (transparent color, no caret) so only the
     rendered slots underneath show — the input still receives every
     keystroke, paste, and screen-reader interaction normally. */
  .otp { position: relative; width: 100%; height: 52px; }
  .otp input {
    position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0;
    border: 0; outline: none; background: transparent; color: transparent;
    caret-color: transparent; font: 20px var(--font-mono); letter-spacing: 0;
    text-transform: uppercase;
  }
  /* The real input's text sits at its natural (left-packed, monospace)
     width, not stretched to match the widely-gapped boxes below it — that
     mismatch is invisible in the ordinary case (color: transparent), but a
     native text-selection highlight ignores color and paints its own
     system color regardless, revealing a gray patch over roughly the
     first few boxes whenever the value is selected (e.g. focus+select()
     after a failed attempt, or the user dragging to select). Neutralizing
     ::selection here keeps the visible-slot illusion intact either way. */
  .otp input::selection { background: transparent; color: transparent; }
  .otp input::-moz-selection { background: transparent; color: transparent; }
  /* No align-items here — the default (stretch) is load-bearing: it's what
     makes .otp-group (and via its height:100%, every .otp-slot) actually
     fill the row's height instead of collapsing to their own content
     height, which for an empty slot is ~0. .otp-sep opts back out with its
     own align-self so the divider stays a thin line, not full height. */
  .otp-slots { position: absolute; inset: 0; display: flex; gap: 7px; pointer-events: none; }
  .otp-group { display: flex; gap: 7px; flex: 1; height: 100%; }
  .otp-slot {
    flex: 1; height: 100%; display: flex; align-items: center; justify-content: center;
    font-family: var(--font-mono); font-size: 19px; font-weight: 500;
    border: 1px solid var(--input); background: color-mix(in oklab, var(--input) 35%, transparent);
    border-radius: calc(var(--radius) * 0.7); color: var(--foreground);
    transition: border-color 120ms, box-shadow 120ms;
  }
  .otp-slot.filled { border-color: color-mix(in oklab, var(--border), var(--foreground) 15%); }
  .otp-slot.active { border-color: var(--amber); box-shadow: 0 0 0 3px color-mix(in oklab, var(--amber) 30%, transparent); }
  .otp-sep { width: 10px; height: 1px; background: var(--border); flex-shrink: 0; align-self: center; }

  button {
    width: 100%; margin-top: 16px; padding: 12px; border-radius: calc(var(--radius) * 0.9); border: none;
    background: var(--amber); color: var(--primary-foreground); font-weight: 600; font-size: 14px; cursor: pointer;
    font-family: var(--font-sans);
  }
  button:disabled { opacity: 0.6; cursor: default; }
  .msg { min-height: 18px; margin-top: 10px; font-size: 12.5px; color: var(--coral); }
</style>
</head>
<body>
  <form class="card" id="gate" autocomplete="off">
    <div class="brand"><img src="/logo.png" alt=""><span>Cursor Dash</span></div>
    <p class="desc">Enter the 8-character access code shown in the terminal that started this dashboard.</p>

    <div class="otp">
      <input id="code" name="code" maxlength="9" inputmode="text" autocapitalize="characters"
             autocomplete="one-time-code" spellcheck="false" autofocus
             aria-label="8-character access code">
      <div class="otp-slots" id="slots" aria-hidden="true">
        <div class="otp-group" id="group1"></div>
        <div class="otp-sep"></div>
        <div class="otp-group" id="group2"></div>
      </div>
    </div>

    <button type="submit">Continue</button>
    <div class="msg" id="msg">${error ? 'Incorrect code. Try again.' : ''}</div>
  </form>
  <script>
    const form = document.getElementById('gate');
    const input = document.getElementById('code');
    const msg = document.getElementById('msg');
    const btn = form.querySelector('button');
    const group1 = document.getElementById('group1');
    const group2 = document.getElementById('group2');

    // 8 slot divs, 4 per group — value characters map straight across;
    // a hyphen (typed or pasted from the CLI's "XXXX-XXXX" display) is
    // ignored for slot purposes but left in the underlying input value,
    // same as the server-side normalization does.
    const slots = [];
    for (let i = 0; i < 8; i++) {
      const el = document.createElement('div');
      el.className = 'otp-slot';
      (i < 4 ? group1 : group2).appendChild(el);
      slots.push(el);
    }

    function render() {
      const chars = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').split('');
      const active = Math.min(chars.length, 7);
      slots.forEach((slot, i) => {
        slot.textContent = chars[i] || '';
        slot.classList.toggle('filled', i < chars.length);
        slot.classList.toggle('active', document.activeElement === input && i === active);
      });
    }
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('blur', render);
    slots.forEach((slot) => slot.style.pointerEvents = 'none');
    document.querySelector('.otp').addEventListener('click', () => input.focus());
    render();

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
      input.focus();
      input.select();
    });
  </script>
</body>
</html>`
}
