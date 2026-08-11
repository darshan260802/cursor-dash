// Live updates: poll the files backing the index for mtime/size changes
// and refresh the store when they move. Polling (rather than fs.watch) is
// deliberate — WAL checkpoints replace/truncate the -wal file in ways
// fs.watch reports inconsistently across macOS/Windows/Linux, while a
// cheap stat-based poll behaves identically everywhere.

import fs from 'node:fs'

function signatureFor(targets) {
  return targets
    .map((t) => {
      try {
        const st = fs.statSync(t)
        return `${t}:${st.mtimeMs}:${st.size}`
      } catch {
        return `${t}:missing`
      }
    })
    .join('|')
}

export function startWatcher(store, { activeIntervalMs = 750, idleIntervalMs = 1500 } = {}) {
  let stopped = false
  let timer = null
  let lastSignature = signatureFor(store.watchTargets())

  function nextIntervalMs() {
    // Poll faster while a turn is actively generating, so /live feels
    // responsive; back off to the idle cadence the rest of the time.
    try {
      return store.getLiveState().isGenerating ? activeIntervalMs : idleIntervalMs
    } catch {
      return idleIntervalMs
    }
  }

  async function tick() {
    if (stopped) return
    const sig = signatureFor(store.watchTargets())
    if (sig !== lastSignature) {
      lastSignature = sig
      try {
        await store.refresh()
      } catch (err) {
        console.error('[cursor-dash] live refresh failed:', err.message)
      }
    }
    if (!stopped) timer = setTimeout(tick, nextIntervalMs())
  }

  timer = setTimeout(tick, nextIntervalMs())

  return function stopWatcher() {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
