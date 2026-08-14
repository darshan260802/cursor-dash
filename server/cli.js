#!/usr/bin/env node
// Entry point for the `cursor-dash` bin (installed globally, or run via
// `npx @darshanpatel2608/cursor-dash`): builds the index, starts the local
// HTTP server, and opens the dashboard in the default browser.

import path from 'node:path'
import fs from 'node:fs'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { Store } from './cache.js'
import { createServer } from './index.js'
import { startWatcher } from './watch.js'
import { formatCodeForDisplay } from './share.js'
import { createShareController } from './shareController.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))

function parseArgs(argv) {
  const args = { port: 7788, open: true, cloud: false, dataDir: null, share: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port' || a === '-p') args.port = Number(argv[++i])
    else if (a === '--data-dir') args.dataDir = argv[++i]
    else if (a === '--no-open') args.open = false
    else if (a === '--cloud') args.cloud = true
    else if (a === '--share') args.share = true
    else if (a === '--help' || a === '-h') args.help = true
    else if (a === '--version' || a === '-v') args.version = true
  }
  return args
}

function printHelp() {
  console.log(`cursor-dash v${pkg.version}

Usage:
  cursor-dash [options]                        (after a global install)
  npx @darshanpatel2608/cursor-dash [options]   (without installing)

Options:
  -p, --port <n>     Port to listen on (default: 7788, auto-increments if taken)
      --data-dir <p>  Override the Cursor data directory to scan
      --no-open       Don't open the dashboard in a browser
      --cloud         Enable the optional live Cursor usage sync (reads your local
                       Cursor auth token and calls cursor.com — off by default)
      --share         Expose the dashboard on a public HTTPS URL via a free
                       Cloudflare Quick Tunnel, gated by a one-time 8-character
                       access code. Nothing to install or sign up for — the
                       tunnel binary downloads itself on first use. Sharing can
                       also be started and stopped later from the dashboard's
                       Share page, without this flag.
  -h, --help          Show this help
  -v, --version       Show the version
`)
}

function openBrowser(url) {
  const platform = process.platform
  let command
  let cmdArgs
  if (platform === 'darwin') {
    command = 'open'
    cmdArgs = [url]
  } else if (platform === 'win32') {
    command = 'cmd'
    cmdArgs = ['/c', 'start', '""', url]
  } else {
    command = 'xdg-open'
    cmdArgs = [url]
  }
  try {
    const child = spawn(command, cmdArgs, { stdio: 'ignore', detached: true })
    child.on('error', () => {
      console.log(`  (couldn't auto-open a browser — visit ${url} manually)`)
    })
    child.unref()
  } catch {
    console.log(`  (couldn't auto-open a browser — visit ${url} manually)`)
  }
}

/** Best-effort clipboard copy, one OS command per platform (no dependency
 * — same reasoning as openBrowser above). Resolves false rather than
 * throwing when nothing suitable is available, so a caller can fall back
 * to just telling the user to select the text themselves. */
function copyToClipboard(text) {
  return new Promise((resolve) => {
    const platform = process.platform
    const candidates =
      platform === 'darwin'
        ? [['pbcopy', []]]
        : platform === 'win32'
          ? [['clip', []]]
          : [
              ['wl-copy', []],
              ['xclip', ['-selection', 'clipboard']],
              ['xsel', ['--clipboard', '--input']],
            ]

    function tryNext(i) {
      if (i >= candidates.length) return resolve(false)
      const [command, cmdArgs] = candidates[i]
      let child
      try {
        child = spawn(command, cmdArgs, { stdio: ['pipe', 'ignore', 'ignore'] })
      } catch {
        return tryNext(i + 1)
      }
      child.on('error', () => tryNext(i + 1))
      child.on('exit', (code) => resolve(code === 0))
      child.stdin.end(text)
    }
    tryNext(0)
  })
}

/** Lets the person running a share press `c`/`s` to copy the access code
 * or share URL without reaching for the mouse to select terminal text —
 * both are one-shot secrets, so a fast copy matters more here than in the
 * rest of the CLI. Reads the current code/URL from `share.status()` at
 * keypress time rather than capturing them by value, since a share started
 * from the dashboard (not just `--share`) can be stopped and restarted
 * with a fresh code/URL while the process keeps running. Raw mode
 * intercepts Ctrl-C from ever reaching Node as a SIGINT (the terminal
 * driver's translation is exactly what raw mode disables), so Ctrl-C is
 * handled explicitly here and routed to the same `shutdown` the
 * SIGINT/SIGTERM handlers use — without this, the process would become
 * unkillable by Ctrl-C the moment this listener attaches. No-ops entirely
 * when stdin isn't a TTY (piped input, a non-interactive shell, some CI
 * environments), where raw mode either fails or doesn't make sense, or
 * when a share's already active hotkeys have already been enabled once. */
let shareHotkeysEnabled = false
function enableShareHotkeys({ share, shutdown }) {
  if (!process.stdin.isTTY || shareHotkeysEnabled) return
  shareHotkeysEnabled = true

  readline.emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdin.resume()

  console.log('  press c to copy the access code, s to copy the share link\n')

  process.stdin.on('keypress', async (_str, key) => {
    if (!key) return
    if (key.ctrl && key.name === 'c') {
      shutdown()
      return
    }
    const { code, url } = share.status()
    if (key.name === 'c') {
      if (!code) return
      const ok = await copyToClipboard(code)
      console.log(ok ? '  ✓ access code copied' : "  couldn't copy — no clipboard tool found")
    } else if (key.name === 's') {
      if (!url) return
      const ok = await copyToClipboard(url)
      console.log(ok ? '  ✓ share link copied' : "  couldn't copy — no clipboard tool found")
    }
  })
}

function listenOnFreePort(server, startPort, host, attemptsLeft = 20) {
  return new Promise((resolve, reject) => {
    function tryPort(port, remaining) {
      const onError = (err) => {
        server.removeListener('listening', onListening)
        if (err.code === 'EADDRINUSE' && remaining > 0) {
          tryPort(port + 1, remaining - 1)
        } else {
          reject(err)
        }
      }
      const onListening = () => {
        server.removeListener('error', onError)
        resolve(port)
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, host)
    }
    tryPort(startPort, attemptsLeft)
  })
}

/** Prints the "here's the link and code" banner — the same text whether
 * the share was started by `--share` at launch or from the dashboard's
 * Share page later, since either way it's the first moment a public
 * URL/code exist to show. */
function printShareBanner({ url, code }) {
  console.log(`  Shared publicly at  ${url}`)
  console.log(`  Access code         ${formatCodeForDisplay(code)}\n`)
  console.log('  Send both to whoever should see this dashboard. The link and code are new')
  console.log('  every time sharing starts, and both stop working the moment it stops.')
  console.log('  Anyone with them can read every session, transcript and file diff on this')
  console.log('  machine. Ctrl-C to stop the whole dashboard, or use the Share page to stop')
  console.log('  just the public link.\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) return printHelp()
  if (args.version) return console.log(pkg.version)

  console.log(`cursor-dash v${pkg.version} — indexing local Cursor data...`)
  const store = new Store({ dataDir: args.dataDir })
  await store.init()

  const meta = store.getMeta()
  console.log(`  found ${meta.sessionCount} session(s) across ${meta.profiles.length} profile(s)`)
  if (meta.profiles.length === 0) {
    console.log('  no Cursor installation found. Pass --data-dir to point at one explicitly.')
  }

  // Always constructed, starting idle — this is what lets sharing be
  // turned on and off at runtime from the dashboard's Share page, not just
  // decided once via `--share` before the server starts listening.
  const share = createShareController()

  const server = createServer(store, { cloudEnabled: args.cloud, share })
  const host = '127.0.0.1'
  const port = await listenOnFreePort(server, args.port, host)
  const url = `http://${host}:${port}`
  share.setPort(port)

  console.log(`\n  cursor-dash is running at ${url}\n`)
  if (args.cloud) {
    console.log(
      '  live cloud usage sync is enabled — this sends your local Cursor auth token to cursor.com when requested from the UI.'
    )
  }

  const stopWatcher = startWatcher(store)

  if (args.open) openBrowser(url)

  const shutdown = () => {
    console.log('\nshutting down cursor-dash...')
    stopWatcher()
    share.stop().catch(() => {})
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1000).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Prints the link/code banner and enables the c/s copy hotkeys the first
  // time a share goes active — whether that's `--share` at launch or a
  // later click on the dashboard's Share page.
  share.onChange((status) => {
    if (status.state === 'active') {
      printShareBanner(status)
      enableShareHotkeys({ share, shutdown })
    }
  })

  if (args.share) await share.start()
}

main().catch((err) => {
  console.error('[cursor-dash] failed to start:', err)
  process.exit(1)
})
