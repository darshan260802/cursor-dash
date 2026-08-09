// Cross-platform discovery of Cursor's on-disk data stores.
//
// Cursor (and Cursor Nightly) keep two separate trees per platform:
//  - the Electron/VSCode "User" tree, holding the SQLite state stores
//  - the "~/.cursor" tree, holding agent transcripts and AI-code tracking
//
// Every path returned here is a *candidate*. Nothing is assumed to exist —
// callers must stat before reading, and every scanner degrades gracefully
// when a source is missing.

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

const home = os.homedir()

function appDataRoots() {
  // Windows: %APPDATA% is normally set; fall back to the conventional path.
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
  switch (process.platform) {
    case 'darwin':
      return [path.join(home, 'Library', 'Application Support')]
    case 'win32':
      return [appData]
    default:
      // Linux and other XDG-ish platforms.
      return [process.env.XDG_CONFIG_HOME || path.join(home, '.config')]
  }
}

const APP_NAMES = ['Cursor', 'Cursor Nightly']

/**
 * Build the list of candidate installation "profiles" to scan.
 * Each profile pairs a global storage tree with its sibling ~/.cursor-style
 * user directory, plus a human label for the UI.
 */
export function discoverProfiles(overrideDir) {
  const profiles = []

  if (overrideDir) {
    profiles.push({
      id: 'override',
      label: `Custom (${overrideDir})`,
      globalStorageDir: path.join(overrideDir, 'globalStorage'),
      userDir: path.join(overrideDir, 'User'),
      cursorHomeDir: path.join(overrideDir, 'cursor-home'),
      workspaceStorageDir: path.join(overrideDir, 'workspaceStorage'),
    })
    return profiles
  }

  const roots = appDataRoots()
  for (const root of roots) {
    for (const app of APP_NAMES) {
      const appRoot = path.join(root, app)
      const userDir = path.join(appRoot, 'User')
      if (!fs.existsSync(userDir)) continue
      profiles.push({
        id: app === 'Cursor' ? 'stable' : 'nightly',
        label: app,
        appRoot,
        userDir,
        globalStorageDir: path.join(userDir, 'globalStorage'),
        workspaceStorageDir: path.join(userDir, 'workspaceStorage'),
      })
    }
  }

  // The ~/.cursor directory is shared across stable/nightly on every platform.
  const cursorHomeDir = process.env.CURSOR_DASH_HOME_DIR || path.join(home, '.cursor')
  for (const profile of profiles) {
    profile.cursorHomeDir = cursorHomeDir
  }

  return profiles
}

export function resolveDataDir(cliOverride) {
  return cliOverride || process.env.CURSOR_DASH_DATA_DIR || null
}

/** Well-known files/dirs inside a profile, resolved lazily so missing ones are cheap to check. */
export function profileSources(profile) {
  return {
    globalStateDb: path.join(profile.globalStorageDir, 'state.vscdb'),
    conversationSearchDb: path.join(profile.globalStorageDir, 'conversation-search.db'),
    workspaceStorageDir: profile.workspaceStorageDir,
    aiTrackingDb: path.join(profile.cursorHomeDir, 'ai-tracking', 'ai-code-tracking.db'),
    projectsDir: path.join(profile.cursorHomeDir, 'projects'),
  }
}

export function exists(p) {
  try {
    fs.accessSync(p, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

export const configDir = process.env.CURSOR_DASH_CONFIG_DIR || path.join(home, '.cursor-dash')
export const configFile = path.join(configDir, 'config.json')
