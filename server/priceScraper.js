// Best-effort refresh of per-model pricing from Cursor's own published docs
// page. This is scraping, not an API — it reads the server-rendered HTML of
// https://cursor.com/docs/models-and-pricing and parses whatever <table>
// elements have an "Input" column. No auth token or account data is sent;
// it's the same request a browser makes loading that page.
//
// It is inherently fragile: if Cursor changes the page's markup, this stops
// finding rows and fails closed with a clear reason, exactly like the
// cloud-usage sync in cloud.js does for its own (also unofficial) endpoint.

const PRICING_URL = 'https://cursor.com/docs/models-and-pricing'

function stripCell(html) {
  return html
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function parseMoney(text) {
  if (!text || text === '-') return null
  const n = Number(text.replace(/^\$/, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Parse every pricing table out of the docs page HTML.
 * @returns {{label: string, slug: string, fast: boolean, input: number|null, output: number|null, cacheRead: number|null}[]}
 */
export function parsePricingTables(html) {
  const rows = []
  const seen = new Set()

  const tableRe = /<table[\s\S]*?<\/table>/g
  let tableMatch
  while ((tableMatch = tableRe.exec(html))) {
    const table = tableMatch[0]
    const theadMatch = /<thead[\s\S]*?<\/thead>/.exec(table)
    if (!theadMatch) continue

    const headers = [...theadMatch[0].matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1].trim())
    const inputIdx = headers.indexOf('Input')
    const outputIdx = headers.indexOf('Output')
    const cacheReadIdx = headers.indexOf('Cache Read')
    if (inputIdx === -1 || outputIdx === -1) continue // not a token-pricing table (e.g. the Plan/Price table)

    const bodyStart = theadMatch.index + theadMatch[0].length
    const body = table.slice(bodyStart)
    const rowRe = /<tr>([\s\S]*?)<\/tr>/g
    let rowMatch
    while ((rowMatch = rowRe.exec(body))) {
      const rowHtml = rowMatch[1]
      const nameMatch = /<a[^>]*href="(\/docs\/models\/[^"]+)"[^>]*>([^<]+)<\/a>/.exec(rowHtml)
      if (!nameMatch) continue

      const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => stripCell(m[1]))
      // cells[0] is the name column; data columns start at index 1, so shift
      // the header-derived indices by one to align.
      const dataCells = cells.slice(1)

      const slug = nameMatch[1].replace('/docs/models/', '')
      let label = nameMatch[2].trim()
      let fast = false
      const fastMatch = /^(.*?)\s*\(Fast\)$/i.exec(label)
      if (fastMatch) {
        label = fastMatch[1].trim()
        fast = true
      }

      const dedupeKey = `${slug}:${fast}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      rows.push({
        label,
        slug,
        fast,
        input: parseMoney(dataCells[inputIdx - 1]),
        output: parseMoney(dataCells[outputIdx - 1]),
        cacheRead: cacheReadIdx !== -1 ? parseMoney(dataCells[cacheReadIdx - 1]) : null,
      })
    }
  }

  return rows
}

function slugifyLabel(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/** Map parsed rows into the same {modelKey: {input, output, note}} shape as pricing.json. */
export function toPricingModels(rows) {
  const models = {}
  for (const row of rows) {
    if (row.input == null && row.output == null) continue
    const key = slugifyLabel(row.label) + (row.fast ? '-fast' : '')
    models[key] = {
      input: row.input,
      output: row.output,
      note: `From cursor.com/docs/models-and-pricing${row.fast ? ' (fast variant)' : ''}`,
    }
  }
  return models
}

export async function fetchLivePricing() {
  let res
  try {
    res = await fetch(PRICING_URL, { signal: AbortSignal.timeout(10_000) })
  } catch (err) {
    return { ok: false, reason: 'network-error', message: String(err?.message || err) }
  }

  if (!res.ok) {
    return { ok: false, reason: `http-${res.status}` }
  }

  let html
  try {
    html = await res.text()
  } catch (err) {
    return { ok: false, reason: 'read-error', message: String(err?.message || err) }
  }

  const rows = parsePricingTables(html)
  if (rows.length === 0) {
    return { ok: false, reason: 'no-pricing-table-found' }
  }

  return {
    ok: true,
    models: toPricingModels(rows),
    fetchedAt: Date.now(),
    sourceUrl: PRICING_URL,
  }
}
