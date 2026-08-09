const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })
const plainNumber = new Intl.NumberFormat(undefined)

export function formatTokens(n: number): string {
  if (n < 1000) return plainNumber.format(n)
  return compactNumber.format(n)
}

export function formatNumber(n: number): string {
  return plainNumber.format(n)
}

export function formatCost(usd: number, unpricedTokens = 0): string {
  if (usd === 0 && unpricedTokens > 0) return "—"
  if (usd < 0.01 && usd > 0) return "<$0.01"
  return `$${usd.toFixed(2)}`
}

export function formatPercent(n: number | null | undefined, digits = 0): string {
  if (n == null) return "—"
  return `${n.toFixed(digits)}%`
}

export function formatDate(ms: number | string | null): string {
  if (!ms) return "—"
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function formatDateTime(ms: number | string | null): string {
  if (!ms) return "—"
  const d = new Date(ms)
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export function formatRelativeTime(ms: number | null): string {
  if (!ms) return "—"
  const diff = Date.now() - ms
  const abs = Math.abs(diff)
  const minute = 60_000
  const hour = 3_600_000
  const day = 86_400_000
  if (abs < minute) return "just now"
  if (abs < hour) return `${Math.round(abs / minute)}m ago`
  if (abs < day) return `${Math.round(abs / hour)}h ago`
  if (abs < day * 30) return `${Math.round(abs / day)}d ago`
  return formatDate(ms)
}

export function formatDuration(ms: number | null): string {
  if (ms == null || ms < 0) return "—"
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/** Local-time YYYY-MM-DD for an <input type="date"> value — deliberately
 * not toISOString(), which is UTC and can land on the wrong day. */
export function toDateInputValue(ms: number | null): string {
  if (!ms) return ""
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Parses an <input type="date"> value as the start (00:00:00) or end
 * (23:59:59.999) of that local day, so a date-range filter is inclusive. */
export function dateInputToMs(value: string, bound: "start" | "end"): number | null {
  if (!value) return null
  const suffix = bound === "start" ? "T00:00:00" : "T23:59:59.999"
  const ms = new Date(value + suffix).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function pathBasename(p: string | null): string | null {
  if (!p) return null
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || p
}
