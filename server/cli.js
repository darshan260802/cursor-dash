#!/usr/bin/env node
// Entry point for the `cursor-dash` bin (installed globally, or run via
// `npx @darshanpatel2608/cursor-dash`): builds the index, starts the local
// HTTP server, and opens the dashboard in the default browser.

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { Store } from './cache.js'
import { createServer } from './index.js'
import { startWatcher } from './watch.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))

function parseArgs(argv) {
  const args = { port: 7788, open: true, cloud: false, dataDir: null, share: false, shareUrl: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port' || a === '-p') args.port = Number(argv[++i])
    else if (a === '--data-dir') args.dataDir = argv[++i]
    else if (a === '--no-open') args.open = false
    else if (a === '--cloud') args.cloud = true
    else if (a === '--share') args.share = true
    else if (a === '--share-url') args.shareUrl = argv[++i]
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
                       tunnel binary downloads itself on first use.
      --share-url <u> Use a tunnel you already run (ngrok, tailscale funnel, a
                       named cloudflared tunnel) instead of starting one; the
                       access-code gate still applies.
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

/** Publishes a public URL for an already-listening `share` gate: either
 * registers a URL the caller already runs (`--share-url`) or starts a free
 * Cloudflare Quick Tunnel pointed at `port`. `share`'s allow-list is
 * mutated in place once the hostname is known — safe to do after the
 * server is already accepting connections, since it's the same gate
 * object `createServer` was given, just populated a moment later than it
 * was constructed. The local bind (127.0.0.1) never changes for this:
 * cloudflared connects out to loopback and forwards in, so `--share` never
 * opens a listening port on the network itself. Returns `publicUrl: null`
 * on any failure, so a broken or unreachable tunnel degrades to "local
 * dashboard only" rather than crashing the whole process. */
async function publishShare(share, { port, shareUrl }) {
  if (shareUrl) {
    try {
      share.addAllowedHost(new URL(shareUrl).hostname)
      return { publicUrl: shareUrl, tunnel: null }
    } catch {
      console.error(`  [cursor-dash] --share-url "${shareUrl}" is not a valid URL — sharing disabled.`)
      return { publicUrl: null, tunnel: null }
    }
  }

  console.log('  starting a public tunnel (Cloudflare Quick Tunnel, via untun)...')
  console.log('  first run downloads the cloudflared binary from GitHub into your home')
  console.log('  directory; using --share means you accept the Cloudflare Terms that')
  console.log('  installation prints. See: https://developers.cloudflare.com/cloudflare-one/')
  console.log('  networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/\n')

  try {
    const { startTunnel } = await import('untun')
    const tunnel = await startTunnel({ port, acceptCloudflareNotice: true })
    if (!tunnel) throw new Error('tunnel setup did not complete')
    const publicUrl = await tunnel.getURL()
    share.addAllowedHost(new URL(publicUrl).hostname)
    return { publicUrl, tunnel }
  } catch (err) {
    console.error(`  [cursor-dash] could not start a public tunnel: ${err.message}`)
    console.error('  continuing with the local dashboard only.\n')
    return { publicUrl: null, tunnel: null }
  }
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

  // The gate object must exist before createServer() so the request
  // handler's closure captures the real thing rather than null — but its
  // allow-list is only populated once the public URL is known, below.
  let share = null
  let code = null
  if (args.share || args.shareUrl) {
    const { createShareGate, generateCode } = await import('./share.js')
    code = generateCode()
    share = createShareGate({ code })
  }

  const server = createServer(store, { cloudEnabled: args.cloud, share })
  const host = '127.0.0.1'
  const port = await listenOnFreePort(server, args.port, host)
  const url = `http://${host}:${port}`

  let tunnel = null
  let publicUrl = null
  if (share) {
    const result = await publishShare(share, { port, shareUrl: args.shareUrl })
    tunnel = result.tunnel
    publicUrl = result.publicUrl
  }

  console.log(`\n  cursor-dash is running at ${url}\n`)
  if (args.cloud) {
    console.log(
      '  live cloud usage sync is enabled — this sends your local Cursor auth token to cursor.com when requested from the UI.'
    )
  }
  if (publicUrl) {
    console.log(`  Shared publicly at  ${publicUrl}`)
    console.log(`  Access code         ${code}\n`)
    console.log('  Send both to whoever should see this dashboard. The link and code are new')
    console.log('  every time you start cursor-dash, and both stop working when you stop it.')
    console.log('  Anyone with them can read every session, transcript and file diff on this')
    console.log('  machine. Ctrl-C to stop sharing.\n')
  }

  const stopWatcher = startWatcher(store)

  if (args.open) openBrowser(url)

  const shutdown = () => {
    console.log('\nshutting down cursor-dash...')
    stopWatcher()
    if (tunnel) tunnel.close().catch(() => {})
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1000).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[cursor-dash] failed to start:', err)
  process.exit(1)
})
