// Owns the public-share *lifecycle* — starting/stopping the Cloudflare
// Quick Tunnel via `untun` and tracking state across the run — layered on
// top of share.js's gate, which is deliberately auth-only (code
// verification, host allow-list, session tokens). Splitting it this way is
// what lets sharing be started and stopped at runtime from the dashboard:
// a single controller instance is created once at server startup and
// handed to both createServer() (for auth) and the CLI (for the terminal
// banner/hotkeys), instead of `--share`'s old model of deciding everything
// once in main() before the server even starts listening.

import { createShareGate, generateCode } from './share.js'

// untun registers its own process-level SIGINT/SIGTERM/SIGHUP handlers
// every time startTunnel() is called and never removes them, so repeated
// start/stop cycles from the dashboard slowly accumulate listeners. They're
// harmless (each just races the same cleanup), but Node warns past 10 by
// default — raise the ceiling rather than let a normal session of a few
// start/stops print a MaxListenersExceededWarning.
process.setMaxListeners(20)

// untun's cloudflared wrapper (node_modules/untun/dist/_chunks/cloudflared.mjs)
// creates a per-tunnel "connections" promise that it never exposes through
// untun's public startTunnel() API and never attaches a rejection handler
// to — unlike its sibling `url` promise, which the library defensively
// no-ops with `.catch(() => void 0)`. Every time the cloudflared child
// process exits — including the *graceful* exit our own `stop()` triggers
// on purpose — that orphaned promise rejects with nobody listening, which
// Node treats as an unhandled rejection and crashes the whole process by
// default. Verified by reproduction: without this handler, clicking "Stop
// sharing" took the entire dashboard down with it, which is exactly what
// this feature exists to avoid (a share tunnel failing to start hits the
// same code path and would otherwise crash cursor-dash before it even
// finishes booting). Only this specific, recognizable message is
// swallowed — anything else still crashes the process exactly as Node's
// default would, so an unrelated real bug doesn't go silently unnoticed.
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  if (/cloudflared exited .* before URL was ready/.test(message)) return
  console.error('[cursor-dash] unhandled rejection:', reason)
  process.exit(1)
})

/** Creates the controller, starting idle — inactive until `start()` is
 * called, whether that's from `--share` at launch or the dashboard's Share
 * page later. */
export function createShareController() {
  const gate = createShareGate()

  let port = null
  let state = 'idle' // 'idle' | 'starting' | 'active' | 'error'
  let publicUrl = null
  let code = null
  let startedAt = null
  let error = null
  let tunnel = null
  let startPromise = null
  const listeners = new Set()

  function setPort(p) {
    port = p
  }

  function emitChange() {
    const snapshot = status()
    for (const fn of listeners) {
      try {
        fn(snapshot)
      } catch {
        /* a listener's own error shouldn't break the controller */
      }
    }
  }

  function onChange(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  function status() {
    return { state, url: publicUrl, code, startedAt, error }
  }

  function isActive() {
    return state === 'active'
  }

  /** Starts a fresh tunnel + code. Idempotent while already starting or
   * active — returns the in-flight/latest result rather than racing a
   * second `cloudflared` process. Failures degrade to `state: 'error'`
   * and leave the local dashboard (and gate) untouched, matching the old
   * CLI-only behavior of never crashing the whole process over a tunnel
   * that couldn't come up. */
  async function start() {
    if (state === 'active') return status()
    if (state === 'starting' && startPromise) return startPromise

    state = 'starting'
    error = null
    emitChange()

    startPromise = (async () => {
      try {
        console.log('  starting a public tunnel (Cloudflare Quick Tunnel, via untun)...')
        console.log('  first run downloads the cloudflared binary from GitHub into your home')
        console.log('  directory; sharing means accepting the Cloudflare Terms that installation')
        console.log('  prints. See: https://developers.cloudflare.com/cloudflare-one/networks/')
        console.log('  connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/\n')

        const { startTunnel } = await import('untun')
        const newTunnel = await startTunnel({ port, acceptCloudflareNotice: true })
        if (!newTunnel) throw new Error('tunnel setup did not complete')
        const url = await newTunnel.getURL()

        const newCode = generateCode()
        gate.setCode(newCode)
        gate.addAllowedHost(new URL(url).hostname)

        tunnel = newTunnel
        publicUrl = url
        code = newCode
        startedAt = Date.now()
        state = 'active'
        error = null
        return status()
      } catch (err) {
        console.error(`  [cursor-dash] could not start a public tunnel: ${err.message}`)
        state = 'error'
        error = err.message
        publicUrl = null
        code = null
        startedAt = null
        tunnel = null
        return status()
      } finally {
        startPromise = null
        emitChange()
      }
    })()

    return startPromise
  }

  /** Tears down the tunnel process and revokes access — but never touches
   * the main HTTP server, so the local dashboard keeps running untouched.
   * Safe to call from `idle`/`error` (no-op past clearing state). */
  async function stop() {
    if (state === 'starting' && startPromise) {
      // Let the in-flight start settle first so we don't leak a tunnel
      // process that finishes coming up right after we told it to stop.
      await startPromise
    }

    const previousUrl = publicUrl
    const activeTunnel = tunnel

    gate.revokeAllTokens()
    if (previousUrl) {
      try {
        gate.removeAllowedHost(new URL(previousUrl).hostname)
      } catch {
        /* malformed URL never made it this far in practice */
      }
    }
    gate.clearCode()

    tunnel = null
    publicUrl = null
    code = null
    startedAt = null
    error = null
    state = 'idle'
    emitChange()

    if (activeTunnel) {
      try {
        await activeTunnel.close()
      } catch {
        /* best-effort — the process may already be gone */
      }
    }
  }

  return {
    setPort,
    start,
    stop,
    status,
    isActive,
    onChange,
    // Gate passthrough — same objects/semantics share.js always exposed,
    // just reached through the controller now that it's the thing held
    // for the life of the process.
    isAllowedHost: gate.isAllowedHost,
    isAuthorized: gate.isAuthorized,
    isOwnerRequest: gate.isOwnerRequest,
    verify: gate.verify,
    tokenCookie: gate.tokenCookie,
  }
}
