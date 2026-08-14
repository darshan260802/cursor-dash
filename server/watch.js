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

// How long to keep polling at the active cadence after the last detected
// change, even once `isGenerating` itself has gone false. A turn ending
// and a new one starting are both "changes" a user is watching for, and
// sampling the very first tick of a new turn at the idle rate is exactly
// the perceptible lag this file exists to avoid.
const HOT_WINDOW_MS = 5_000

export function startWatcher(store, { activeIntervalMs = 300, idleIntervalMs = 1000 } = {}) {
  let stopped = false
  let timer = null
  let lastSignature = signatureFor(store.watchTargets())
  let lastChangeAt = 0

  function nextIntervalMs() {
    // Poll faster while a turn is actively generating, or shortly after any
    // change was seen, so /live feels responsive; back off to the idle
    // cadence once things have been quiet for a while. The stat-based
    // signature check this gates is sub-millisecond even against a large
    // profile, so the cost of polling faster is negligible — it's purely a
    // latency/CPU-wakeups tradeoff, and latency is what users notice.
    try {
      if (store.getLiveState().isGenerating) return activeIntervalMs
    } catch {
      /* fall through to the hot-window check below */
    }
    return Date.now() - lastChangeAt < HOT_WINDOW_MS ? activeIntervalMs : idleIntervalMs
  }

  async function tick() {
    if (stopped) return
    const sig = signatureFor(store.watchTargets())
    if (sig !== lastSignature) {
      lastSignature = sig
      lastChangeAt = Date.now()
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
