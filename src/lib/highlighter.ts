// A small, curated Shiki instance (fine-grained bundle) rather than the
// default full bundle — keeps the client bundle reasonable while still
// covering everything a Cursor transcript is likely to contain.

import { createHighlighterCore, type HighlighterCore } from "shiki/core"
import { createOnigurumaEngine } from "shiki/engine/oniguruma"

const LANGS = [
  () => import("shiki/langs/javascript.mjs"),
  () => import("shiki/langs/typescript.mjs"),
  () => import("shiki/langs/tsx.mjs"),
  () => import("shiki/langs/jsx.mjs"),
  () => import("shiki/langs/json.mjs"),
  () => import("shiki/langs/python.mjs"),
  () => import("shiki/langs/bash.mjs"),
  () => import("shiki/langs/shellscript.mjs"),
  () => import("shiki/langs/css.mjs"),
  () => import("shiki/langs/html.mjs"),
  () => import("shiki/langs/markdown.mjs"),
  () => import("shiki/langs/sql.mjs"),
  () => import("shiki/langs/yaml.mjs"),
  () => import("shiki/langs/diff.mjs"),
]

const THEMES = [() => import("shiki/themes/github-dark.mjs"), () => import("shiki/themes/github-light.mjs")]

let highlighterPromise: Promise<HighlighterCore> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      langs: LANGS,
      themes: THEMES,
      engine: createOnigurumaEngine(() => import("shiki/wasm")),
    })
  }
  return highlighterPromise
}

const KNOWN_LANGS = new Set([
  "javascript",
  "js",
  "typescript",
  "ts",
  "tsx",
  "jsx",
  "json",
  "python",
  "py",
  "bash",
  "sh",
  "shellscript",
  "css",
  "html",
  "markdown",
  "md",
  "sql",
  "yaml",
  "yml",
  "diff",
])

export function normalizeLang(lang: string | null | undefined): string {
  if (!lang) return "text"
  const l = lang.toLowerCase()
  if (KNOWN_LANGS.has(l)) return l
  return "text"
}

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  py: "python",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  css: "css",
  html: "html",
  md: "markdown",
  mdx: "markdown",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
}

/** File path -> Shiki lang id, for tool cards that only have a path (a
 * diff, a read, a full-file view) and no explicit `languageId`. */
export function langFromPath(path: string | null | undefined): string {
  if (!path) return "text"
  const ext = path.split(".").pop()?.toLowerCase()
  return (ext && EXT_TO_LANG[ext]) || "text"
}

export async function highlightCode(code: string, lang: string | null | undefined, theme: "dark" | "light"): Promise<string> {
  const normalized = normalizeLang(lang)
  const shikiTheme = theme === "dark" ? "github-dark" : "github-light"
  if (normalized === "text") {
    return `<pre class="shiki-plain"><code>${escapeHtml(code)}</code></pre>`
  }
  try {
    const highlighter = await getHighlighter()
    return highlighter.codeToHtml(code, { lang: normalized, theme: shikiTheme })
  } catch {
    return `<pre class="shiki-plain"><code>${escapeHtml(code)}</code></pre>`
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}
