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
  const args = { port: 7788, open: true, cloud: false, dataDir: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port' || a === '-p') args.port = Number(argv[++i])
    else if (a === '--data-dir') args.dataDir = argv[++i]
    else if (a === '--no-open') args.open = false
    else if (a === '--cloud') args.cloud = true
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

  const server = createServer(store, { cloudEnabled: args.cloud })
  const host = '127.0.0.1'
  const port = await listenOnFreePort(server, args.port, host)
  const url = `http://${host}:${port}`

  console.log(`\n  cursor-dash is running at ${url}\n`)
  if (args.cloud) {
    console.log('  live cloud usage sync is enabled — this sends your local Cursor auth token to cursor.com when requested from the UI.')
  }

  const stopWatcher = startWatcher(store)

  if (args.open) openBrowser(url)

  const shutdown = () => {
    console.log('\nshutting down cursor-dash...')
    stopWatcher()
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
