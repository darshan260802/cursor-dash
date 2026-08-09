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

/**
 * Copy `file` (and its -wal/-shm siblings, if present) into the snapshot
 * dir when the source has changed since the last copy. Returns the
 * snapshot path, or null if the source doesn't exist.
 */
function ensureSnapshot(file) {
  let srcStat
  try {
    srcStat = fs.statSync(file)
  } catch {
    return null
  }

  const dest = snapshotBase(file)
  const metaFile = dest + '.meta.json'
  let fresh = false
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
    fresh = meta.mtimeMs === srcStat.mtimeMs && meta.size === srcStat.size
  } catch {
    fresh = false
  }

  if (!fresh) {
    for (const suffix of ['', '-wal', '-shm']) {
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
    fs.writeFileSync(metaFile, JSON.stringify({ mtimeMs: srcStat.mtimeMs, size: srcStat.size }))
  }

  return dest
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
