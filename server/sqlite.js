// Read-only SQLite access to Cursor's stores.
//
// Two hard rules:
//  1. We NEVER open a Cursor-owned file for writing, and never touch it
//     while Cursor might be mid-write. Every read happens against a
//     snapshot copy in os.tmpdir(), refreshed only when the source's
//     mtime/size changes.
//  2. We never assume a native SQLite binding is installed. `node:sqlite`
//     (built into Node 22.5+) is tried first since it's zero-dependency;
//     `sql.js` (pure WASM) is the fallback for older Node so `npx
//     cursor-dash` works without a compiler toolchain on any platform.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const snapshotDir = path.join(os.tmpdir(), 'cursor-dash-snapshots')
fs.mkdirSync(snapshotDir, { recursive: true })

let nodeSqliteChecked = false
let nodeSqliteMod = null
async function getNodeSqlite() {
  if (nodeSqliteChecked) return nodeSqliteMod
  nodeSqliteChecked = true
  try {
    nodeSqliteMod = await import('node:sqlite')
  } catch {
    nodeSqliteMod = null
  }
  return nodeSqliteMod
}

let sqlJsPromise = null
async function getSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = import('sql.js').then((m) => m.default()).catch((err) => {
      sqlJsPromise = null
      throw err
    })
  }
  return sqlJsPromise
}

function snapshotBase(file) {
  const hash = crypto.createHash('sha1').update(file).digest('hex').slice(0, 16)
  return path.join(snapshotDir, `${hash}-${path.basename(file)}`)
}

const SUFFIXES = ['', '-wal', '-shm']

/**
 * Fingerprint one file (mtime + size, or `missing` if it doesn't exist).
 */
function fileSignature(file) {
  try {
    const st = fs.statSync(file)
    return `${st.mtimeMs}:${st.size}`
  } catch {
    return 'missing'
  }
}

/**
 * Copy `file` (and its -wal/-shm siblings, if present) into the snapshot
 * dir, but only the suffixes that actually changed since the last copy —
 * fingerprinted independently. Cursor runs SQLite in WAL mode, so a live
 * write almost always lands in `-wal` alone and leaves the main file's own
 * mtime/size untouched until the next checkpoint; treating all three
 * suffixes as one signature (as an earlier version of this function did)
 * meant every `-wal`-only write re-copied the main file too — for a
 * multi-hundred-MB `state.vscdb` that's real latency on every poll tick
 * during a live session, paid for nothing. Returns the snapshot path, or
 * null if the source doesn't exist.
 */
function ensureSnapshot(file) {
  if (!exists(file)) return null

  const dest = snapshotBase(file)
  const metaFile = dest + '.meta.json'
  let meta = {}
  try {
    meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
  } catch {
    meta = {}
  }
  const priorSignature = meta.signature && typeof meta.signature === 'object' ? meta.signature : {}
  const nextSignature = { ...priorSignature }
  let changed = false

  for (const suffix of SUFFIXES) {
    const sig = fileSignature(file + suffix)
    if (sig === priorSignature[suffix]) continue
    changed = true
    nextSignature[suffix] = sig
    const s = file + suffix
    const d = dest + suffix
    try {
      fs.copyFileSync(s, d)
    } catch {
      try {
        fs.unlinkSync(d)
      } catch {
        /* no sibling to clean up */
      }
    }
  }

  if (changed) fs.writeFileSync(metaFile, JSON.stringify({ signature: nextSignature }))

  return dest
}

function exists(file) {
  try {
    fs.statSync(file)
    return true
  } catch {
    return false
  }
}

/** Force the next open of `file` to re-copy its snapshot, regardless of
 * signature. Used by the manual refresh endpoint so a user-triggered
 * refresh is never short-circuited by a stale-but-matching fingerprint. */
export function invalidateSnapshot(file) {
  const metaFile = snapshotBase(file) + '.meta.json'
  try {
    fs.unlinkSync(metaFile)
  } catch {
    /* nothing cached yet */
  }
}

function wrapNodeSqlite(db, sourcePath) {
  return {
    backend: 'node:sqlite',
    sourcePath,
    tableExists(name) {
      try {
        return !!db
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
          .get(name)
      } catch {
        return false
      }
    },
    all(sql, params = []) {
      try {
        return db.prepare(sql).all(...params)
      } catch {
        return []
      }
    },
    get(sql, params = []) {
      try {
        return db.prepare(sql).get(...params)
      } catch {
        return undefined
      }
    },
    close() {
      try {
        db.close()
      } catch {
        /* already closed */
      }
    },
  }
}

function wrapSqlJs(db, sourcePath) {
  function run(sql, params) {
    const stmt = db.prepare(sql)
    try {
      if (params.length) stmt.bind(params)
      const rows = []
      while (stmt.step()) rows.push(stmt.getAsObject())
      return rows
    } finally {
      stmt.free()
    }
  }
  return {
    backend: 'sql.js',
    sourcePath,
    tableExists(name) {
      try {
        return run("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?", [name]).length > 0
      } catch {
        return false
      }
    },
    all(sql, params = []) {
      try {
        return run(sql, params)
      } catch {
        return []
      }
    },
    get(sql, params = []) {
      try {
        return run(sql, params)[0]
      } catch {
        return undefined
      }
    },
    close() {
      try {
        db.close()
      } catch {
        /* already closed */
      }
    },
  }
}

/** Open a read-only handle onto `file`, or null if it doesn't exist. */
export async function openDb(file) {
  const snapshot = ensureSnapshot(file)
  if (!snapshot) return null

  const nodeSqlite = await getNodeSqlite()
  if (nodeSqlite) {
    try {
      const db = new nodeSqlite.DatabaseSync(snapshot, { readOnly: true })
      return wrapNodeSqlite(db, file)
    } catch {
      // Fall through to the WASM backend (e.g. a corrupt/locked snapshot).
    }
  }

  try {
    const SQL = await getSqlJs()
    const buffer = fs.readFileSync(snapshot)
    const db = new SQL.Database(buffer)
    return wrapSqlJs(db, file)
  } catch {
    return null
  }
}

export function clearSnapshotCache() {
  try {
    fs.rmSync(snapshotDir, { recursive: true, force: true })
    fs.mkdirSync(snapshotDir, { recursive: true })
  } catch {
    /* best effort */
  }
}
